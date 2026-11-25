/**
 * Простий планувальник періодичних задач у процесі API.
 * Захищає від накладання запусків і не дає помилці задачі зупинити сервер.
 * @returns функція зупинки
 */
export function startPeriodicJob(name: string, job: () => Promise<unknown>, intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await job();
    } catch (error) {
      console.error(`[job:${name}] помилка`, error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
