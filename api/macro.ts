import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadMarketData } from '../server/market-data.js';

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  try {
    const data = await loadMarketData();
    const healthy = !data.unavailable.length && data.series.every(series => !series.refreshFailed);
    response.writeHead(data.series.length ? 200 : 503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': healthy ? 'public, max-age=60, s-maxage=900, stale-while-revalidate=3600' : 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify(data));
  } catch {
    response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ series: [], unavailable: ['VIX', 'VXN', 'US10Y'] }));
  }
}
