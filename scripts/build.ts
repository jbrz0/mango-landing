import { build } from 'vite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { access } from 'node:fs/promises';
import { intelligencePlugin } from '../vite.config';
import { readRepository } from './data';
import { validationError } from '../src/lib/intel/schema';

export async function buildSite(dataDirectory = resolve('data/intel'), outDir = resolve('dist')) {
  for (const legacy of ['daily.json', 'daily.html']) {
    const exists = await access(resolve(legacy)).then(() => true, () => false);
    if (exists) throw new Error(`Obsolete ${legacy} detected. Stop the legacy writer and follow docs/GROKBOT_DATA_UPDATE.md.`);
  }
  await readRepository(dataDirectory); // Fail before replacing any build output.
  await build({ configFile: false, plugins: [intelligencePlugin(dataDirectory)], build: { outDir, emptyOutDir: true, target: 'es2022' } });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildSite().catch(error => { console.error(validationError(error)); process.exitCode = 1; });
}
