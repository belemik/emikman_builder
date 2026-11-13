import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {environment} from './b-test-support';
import {createTestCommandCandidate} from '../../server/projects/test-command-candidate';
const [main,ledger,op,encoded,stage]=process.argv.slice(2);
const e=environment({main,ledger,fault:s=>{if(s===stage){writeFileSync(join(main,'fault-observed'),s);process.kill(process.pid,'SIGKILL');}}});
const c=createTestCommandCandidate(op,Buffer.from(encoded,'base64'));if(c.kind!=='candidate')throw Error('candidate');
process.send?.('ready');process.once('message',()=>{const result=e.repo.execute(e.principal,c.candidate);e.close();process.send?.(result,()=>process.disconnect());});
