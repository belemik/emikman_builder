import {testEnvironment} from './p04-support';
import {startTestHttpHarness} from '../../server/projects/test-http-harness';
import {writeFileSync} from 'node:fs';import {join} from 'node:path';
const [directory,selected]=process.argv.slice(2);
const e=testEnvironment({directory,fault:stage=>{if(stage===selected){writeFileSync(join(directory,'.p04-fault-observed'),stage,{mode:0o600});process.kill(process.pid,'SIGKILL');}}});
const token=e.sessions.issue('fixture-account-A');const http=await startTestHttpHarness(e.repository,e.sessions);
process.send?.({kind:'ready',url:http.url,token});
