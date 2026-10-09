import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadGlobalData } from '../server/global-data.js';
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  try {
    const data = await loadGlobalData();
    const healthy = !data.unavailable.length && !data.quotes.some(q => q.refreshFailed) && !data.newsUnavailable.length && data.sentiment;
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': healthy ? 'public, max-age=60, s-maxage=900, stale-while-revalidate=900' : 'public, max-age=30, s-maxage=60' });
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify(data));
  } catch { response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Global feeds unavailable' })); }
}
