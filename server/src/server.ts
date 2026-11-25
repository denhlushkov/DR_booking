import { createApp } from './app';
import { loadConfig } from './config/env';
import { buildContainer } from './container';
import { startPeriodicJob } from './infrastructure/scheduler';
import { seedDemoData } from './infrastructure/seed';

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // .env не обовʼязковий — змінні можуть надходити з оточення (Docker).
  }

  const config = loadConfig();
  const container = buildContainer(config);

  // NFR-03: якщо БД ще/тимчасово недоступна — чекаємо її, а не завершуємо процес.
  await retry('ініціалізація сховища', async () => {
    await container.init();
    if (config.seedDemoData) await seedDemoData(container.repositories, container.passwordHasher);
  });

  const stopJobs = config.backgroundJobs.enabled
    ? startPeriodicJob('booking-lifecycle', () => container.lifecycleJob.run(), config.backgroundJobs.intervalSeconds * 1000)
    : () => undefined;

  const app = createApp(container);
  const server = app.listen(config.port, () => {
    console.info(`API запущено: http://localhost:${config.port}/api/v1 (сховище: ${config.dataStore})`);
  });

  // Коректне завершення: дочекатися активних запитів і закрити пул з'єднань.
  const shutdown = (signal: string) => {
    console.info(`Отримано ${signal}, зупинка…`);
    stopJobs();
    server.close(() => {
      void container.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function retry(name: string, action: () => Promise<void>, attempts = 30, delayMs = 2000): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.warn(`[startup] ${name}: спроба ${attempt}/${attempts} не вдалася (${(error as Error).message}), повтор через ${delayMs} мс`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

main().catch((error) => {
  console.error('Не вдалося запустити сервер:', error);
  process.exit(1);
});
