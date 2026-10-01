import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseIntel, dateSchema, validationError, type Intel } from '../src/lib/intel/schema';

export const MAX_BYTES = 1_048_576;
export const serialize = (data: Intel) => `${JSON.stringify(data, null, 2)}\n`;
export async function readIntel(path: string): Promise<Intel> {
  const contents = await readFile(path);
  if (contents.byteLength > MAX_BYTES) throw new Error(`${path}: payload exceeds 1 MiB`);
  try { return parseIntel(JSON.parse(contents.toString('utf8').replace(/^\uFEFF/, ''))); }
  catch (error) { throw new Error(`${path}: ${validationError(error)}`); }
}

export async function readRepository(directory: string) {
  const current = await readIntel(join(directory, 'current.json'));
  const archives: Record<string, Intel> = {};
  for (const file of (await readdir(join(directory, 'archive'))).sort()) {
    if (file === '.gitkeep') continue;
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) throw new Error(`Unexpected archive file: ${file}`);
    const date = dateSchema.parse(file.slice(0, -5));
    const data = await readIntel(join(directory, 'archive', file));
    if (data.asOfDate !== date) throw new Error(`Archive filename does not match asOfDate: ${file}`);
    if (date > current.asOfDate) throw new Error(`Archive ${date} is newer than current`);
    archives[date] = data;
  }
  if (serialize(archives[current.asOfDate]) !== serialize(current)) throw new Error('current.json must match its dated archive snapshot');
  return { current, archives, dates: Object.keys(archives).sort().reverse() };
}
