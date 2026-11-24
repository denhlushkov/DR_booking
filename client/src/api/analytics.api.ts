import { request } from './http';

export const analyticsApi = {
  /** FR-07 (ADMIN): завантажує CSV-звіт завантаженості як файл. */
  async downloadUtilizationCsv(from: string, to: string): Promise<void> {
    const csv = await request<string>('/analytics/utilization.csv', { query: { from, to } });
    // BOM — щоб Excel коректно показав кирилицю.
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `utilization_${from.slice(0, 10)}_${to.slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  },
};
