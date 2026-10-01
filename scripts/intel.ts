import { resolve } from 'node:path';
import { readRepository } from './data';
import { recoverSnapshot, summarize, updateSnapshot } from './update';
import { validationError } from '../src/lib/intel/schema';

export function inputArgument(args: string[]) {
  if (args.length !== 2 || args[0] !== '--input' || !args[1]) throw new Error('Usage: npm run intel:update -- --input /absolute/path/payload.json');
  return args[1];
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'validate' && args.length === 0) {
    const data = await readRepository(resolve('data/intel'));
    console.log(`Valid production intelligence: ${summarize(data.current)}; ${data.dates.length} archived snapshot(s).`);
  } else if (command === 'update') {
    const result = await updateSnapshot(inputArgument(args));
    console.log(result.changed ? `Validated, built and atomically updated ${result.date}.` : 'Payload is unchanged; no files written.');
  } else if (command === 'recover' && args.length === 0) {
    await recoverSnapshot(); console.log('Previous snapshot recovered and validated.');
  } else throw new Error('Expected validate, update --input PATH, or recover');
}
main().catch(error => { console.error(`Intelligence update refused:\n${validationError(error)}`); process.exitCode = 1; });
