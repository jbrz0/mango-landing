import { constants } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, open, readFile, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readIntel, readRepository, serialize } from './data';
import type { Intel } from '../src/lib/intel/schema';

export async function atomicWrite(path: string, contents: string | Buffer) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx');
    try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

type Options = {
  root?: string;
  publisher?: boolean;
  // Injected only by isolated tests. The public CLI always runs the real build.
  verify?: (directory: string, output: string) => Promise<void>;
  replace?: typeof atomicWrite;
};

export async function updateSnapshot(input: string, options: Options = {}) {
  const root = options.root ?? process.cwd();
  const directory = join(root, 'data/intel');
  const work = join(root, '.intel-work');
  await mkdir(work, { recursive: true });
  if (!options.publisher) {
    try { await access(join(work, 'publish.lock')); throw new Error('A publish is already in progress.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const lockPath = join(work, 'update.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch { throw new Error('Another update is running, or an interrupted update needs recovery. See docs/GROKBOT_DATA_UPDATE.md.'); }
  let staging: string | undefined;
  try {
    const proposed = await readIntel(resolve(input));
    const old = await readRepository(directory);
    const oldCurrent = await readFile(join(directory, 'current.json'));
    if (proposed.asOfDate < old.current.asOfDate || Date.parse(proposed.generatedAt) < Date.parse(old.current.generatedAt)) {
      throw new Error('Refusing an older snapshot: asOfDate and generatedAt must not move backwards');
    }
    if (serialize(proposed) === serialize(old.current)) return { changed: false, date: proposed.asOfDate, paths: [], rollback: async () => {} };
    if (Date.parse(proposed.generatedAt) === Date.parse(old.current.generatedAt)) throw new Error('Changed data requires a newer generatedAt timestamp');
    staging = await mkdtemp(join(work, 'update-'));
    await mkdir(join(staging, 'archive'));
    for (const date of old.dates) await copyFile(join(directory, 'archive', `${date}.json`), join(staging, 'archive', `${date}.json`));
    const bytes = serialize(proposed);
    await atomicWrite(join(staging, 'current.json'), bytes);
    await atomicWrite(join(staging, 'archive', `${proposed.asOfDate}.json`), bytes);
    await readRepository(staging);
    if (options.verify) await options.verify(staging, join(staging, 'dist'));
    else {
      execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit'], { cwd: root, stdio: 'inherit' });
      const { buildSite } = await import('./build');
      await buildSite(staging, join(staging, 'dist'));
    }
    const archivePath = join(directory, 'archive', `${proposed.asOfDate}.json`);
    const currentPath = join(directory, 'current.json');
    const oldArchive = await readFile(archivePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return null; });
    const rollback = async () => {
      await atomicWrite(currentPath, oldCurrent);
      if (oldArchive) await atomicWrite(archivePath, oldArchive);
      else await rm(archivePath, { force: true });
    };
    // A durable recovery record also covers process/power interruption between the two renames.
    const recovery = join(work, 'recovery.json');
    try { await access(recovery, constants.F_OK); throw new Error('Unresolved recovery.json exists; follow the recovery procedure before updating.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await atomicWrite(recovery, JSON.stringify({ current: oldCurrent.toString('utf8'), archive: oldArchive?.toString('utf8') ?? null, date: proposed.asOfDate }));
    const replace = options.replace ?? atomicWrite;
    try {
      await replace(archivePath, bytes);
      await replace(currentPath, bytes); // Current is the publication pointer and is replaced last.
      await readRepository(directory);
    } catch (error) {
      await rollback();
      throw error;
    } finally {
      // Retain recovery if rollback itself failed; a mismatched repository must fail closed.
      const valid = await readRepository(directory).then(() => true, () => false);
      if (valid) await rm(recovery, { force: true });
    }
    return { changed: true, date: proposed.asOfDate, paths: ['data/intel/current.json', `data/intel/archive/${proposed.asOfDate}.json`], rollback };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

export async function recoverSnapshot(root = process.cwd()) {
  const work = join(root, '.intel-work');
  const record = JSON.parse(await readFile(join(work, 'recovery.json'), 'utf8')) as { current: string; archive: string | null; date: string };
  const { dateSchema, parseIntel } = await import('../src/lib/intel/schema');
  dateSchema.parse(record.date);
  parseIntel(JSON.parse(record.current));
  if (record.archive) parseIntel(JSON.parse(record.archive));
  await atomicWrite(join(root, 'data/intel/current.json'), record.current);
  const archive = join(root, 'data/intel/archive', `${record.date}.json`);
  if (record.archive) await atomicWrite(archive, record.archive); else await rm(archive, { force: true });
  await readRepository(join(root, 'data/intel'));
  await rm(join(work, 'recovery.json'));
  await rm(join(work, 'update.lock'), { force: true });
}

export function summarize(data: Intel) { return `${data.asOfDate} (${data.generatedAt})`; }
