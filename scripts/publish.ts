import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, open, rm } from 'node:fs/promises';
import { updateSnapshot } from './update';
import { readRepository } from './data';
import { buildSite } from './build';
import { validationError } from '../src/lib/intel/schema';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--input') throw new Error('Usage: npm run intel:publish -- --input /absolute/path/payload.json');
  if (git('branch', '--show-current') !== 'main') throw new Error('Publish requires the main branch');
  if (git('status', '--porcelain')) throw new Error('Publish requires a clean checkout; save unrelated work first');
  const baseline = git('rev-parse', 'HEAD');
  git('fetch', 'origin', 'main');
  if (git('rev-parse', 'origin/main') !== baseline) throw new Error('Local main must exactly match origin/main; pull --ff-only first');
  await mkdir('.intel-work', { recursive: true });
  const lock = await open('.intel-work/publish.lock', 'wx').catch(() => { throw new Error('Another publish is in progress, or its interrupted lock needs recovery.'); });
  try {
    const result = await updateSnapshot(args[1]!, { publisher: true });
    if (!result.changed) { console.log('No change to publish.'); return; }
    let committed = false;
    try {
      await readRepository(resolve('data/intel'));
      execFileSync(process.execPath, ['--import', 'tsx', '--test', 'tests/data.test.ts'], { stdio: 'inherit' });
      await buildSite();
      if (git('rev-parse', 'HEAD') !== baseline) throw new Error('HEAD changed during preparation');
      git('add', '--', ...result.paths);
      const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
      if (staged.some(path => !result.paths.includes(path))) throw new Error('Refusing to commit files outside the generated update');
      git('commit', '-m', `intel: ${result.date}`);
      committed = true;
      git('push', 'origin', 'HEAD:main');
      console.log(`Published ${git('rev-parse', 'HEAD')}`);
    } catch (error) {
      if (!committed) {
        const stagedGenerated = git('diff', '--cached', '--name-only').split('\n').filter(path => result.paths.includes(path));
        try { if (stagedGenerated.length) git('restore', '--staged', '--', ...stagedGenerated); }
        finally { await result.rollback(); }
        console.error('Previous current.json and archive restored. Nothing committed or pushed.');
      } else console.error('A validated local commit exists. Push failed; do not force push. Resolve the remote state and retry.');
      throw error;
    }
  } finally { await lock.close(); await rm('.intel-work/publish.lock', { force: true }); }
}
main().catch(error => { console.error(validationError(error)); process.exitCode = 1; });
