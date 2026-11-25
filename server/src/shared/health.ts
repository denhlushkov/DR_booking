/** Перевірка стану залежності (БД тощо) для /health і Docker healthcheck (NFR-03). */
export interface IHealthIndicator {
  readonly name: string;
  check(): Promise<void>;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: Record<string, 'up' | 'down'>;
}

export async function collectHealth(indicators: readonly IHealthIndicator[], timeoutMs = 2000): Promise<HealthReport> {
  const checks: HealthReport['checks'] = {};
  await Promise.all(
    indicators.map(async (indicator) => {
      try {
        await withTimeout(indicator.check(), timeoutMs);
        checks[indicator.name] = 'up';
      } catch {
        checks[indicator.name] = 'down';
      }
    }),
  );
  return {
    status: Object.values(checks).every((c) => c === 'up') ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
