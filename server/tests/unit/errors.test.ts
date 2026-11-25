import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { isTransientConnectionError } from '../../src/shared/errors';
import { errorHandler } from '../../src/shared/http/error-handler';

describe('Недоступність БД (NFR-03)', () => {
  it('розпізнає помилки з’єднання', () => {
    expect(isTransientConnectionError(Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(isTransientConnectionError(Object.assign(new Error('terminating'), { code: '57P01' }))).toBe(true);
    expect(isTransientConnectionError(new Error('timeout exceeded when trying to connect'))).toBe(true);
    expect(isTransientConnectionError(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(isTransientConnectionError(Object.assign(new Error('dup'), { code: '23505' }))).toBe(false);
    expect(isTransientConnectionError(new Error('boom'))).toBe(false);
  });

  it('повертає 503 з Retry-After замість 500', async () => {
    const app = express()
      .get('/', () => {
        throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      })
      .use(errorHandler);
    const res = await request(app).get('/');
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
