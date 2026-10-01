import { defineConfig, type Plugin } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readRepository, serialize } from './scripts/data';
import macroHandler from './api/macro';

export function intelligencePlugin(dataDirectory = resolve('data/intel')): Plugin {
  return {
    name: 'validated-intelligence',
    resolveId(id) { if (id === 'virtual:intel-dates') return '\0intel-dates'; },
    async load(id) {
      if (id === '\0intel-dates') {
        const { dates } = await readRepository(dataDirectory);
        return `export default ${JSON.stringify(dates)}`;
      }
    },
    async generateBundle() {
      const { current, archives, dates } = await readRepository(dataDirectory);
      this.emitFile({ type: 'asset', fileName: 'data/intel/current.json', source: serialize(current) });
      this.emitFile({ type: 'asset', fileName: 'data/intel/manifest.json', source: JSON.stringify({ dates }) });
      for (const [date, data] of Object.entries(archives)) {
        this.emitFile({ type: 'asset', fileName: `data/intel/archive/${date}.json`, source: serialize(data) });
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path === '/api/macro') { await macroHandler(req, res); return; }
        if (['/daily', '/daily/', '/daily.html'].includes(path ?? '')) {
          res.writeHead(308, { Location: '/' }); res.end(); return;
        }
        if (!path?.startsWith('/data/intel/')) return next();
        try {
          if (!/^\/data\/intel\/(current\.json|manifest\.json|archive\/\d{4}-\d{2}-\d{2}\.json)$/.test(path)) {
            res.writeHead(404); res.end(); return;
          }
          const body = path.endsWith('manifest.json')
            ? JSON.stringify({ dates: (await readRepository(dataDirectory)).dates })
            : await readFile(resolve(dataDirectory, path.slice('/data/intel/'.length)));
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); res.end(body);
        } catch { res.writeHead(404); res.end(); }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] === '/api/macro') { await macroHandler(req, res); return; }
        if (['/daily', '/daily/', '/daily.html'].includes(req.url?.split('?')[0] ?? '')) {
          res.writeHead(308, { Location: '/' }); res.end();
        } else next();
      });
    },
  };
}

export default defineConfig({ plugins: [intelligencePlugin()], build: { target: 'es2022' } });
