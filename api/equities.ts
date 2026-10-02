import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEquityData, equitySymbols } from '../server/equity-data.js';

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  try {
    const data = await loadEquityData();
    const healthy = !data.unavailable.length && data.quotes.every(quote => !quote.refreshFailed);
    response.writeHead(data.quotes.length || !equitySymbols.length ? 200 : 503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': healthy ? 'public, max-age=60, s-maxage=900, stale-while-revalidate=900' : 'public, max-age=30, s-maxage=60',
    });
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify(data));
  } catch {
    response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ quotes: [], unavailable: equitySymbols }));
  }
}
