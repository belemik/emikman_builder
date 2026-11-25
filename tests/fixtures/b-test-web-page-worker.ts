import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { environment } from './b-test-support';
import { createWebPageRepositoryCandidate } from '../../server/projects/test-command-candidate';

const [main, ledger, op, encoded, stage, profile] = process.argv.slice(2);
const env = environment({
  main, ledger, webPageProfile: profile === 'workspace-v1' ? 'workspace-v1' : true,
  fault: current => {
    if (current === stage) {
      writeFileSync(join(main, 'web-fault-observed'), current);
      process.kill(process.pid, 'SIGKILL');
    }
  },
});
const candidate = createWebPageRepositoryCandidate(op, Buffer.from(encoded, 'base64'));
if (candidate.kind !== 'candidate') throw Error('Rejected fixture');
process.send?.('ready');
process.once('message', action => {
  const result = action === 'reconcile'
    ? env.repo.reconcile(env.principal, candidate.candidate)
    : env.repo.execute(env.principal, candidate.candidate);
  env.close();
  process.send?.(result, () => process.disconnect());
});
