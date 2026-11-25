import { createApp } from './app';
import { loadConfig } from './config/env';
import { buildContainer } from './container';
import { seedDemoData } from './infrastructure/seed';

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // .env не обовʼязковий — змінні можуть надходити з оточення (Docker).
  }

  const config = loadConfig();
  const container = buildContainer(config);
  if (config.seedDemoData) {
    await seedDemoData(container.repositories, container.passwordHasher);
  }

  const app = createApp(container);
  const server = app.listen(config.port, () => {
    console.info(`API запущено: http://localhost:${config.port}/api/v1 (сховище: ${config.dataStore})`);
  });

  const shutdown = () => {
    server.close(() => {
      void container.close().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Не вдалося запустити сервер:', error);
  process.exit(1);
});
