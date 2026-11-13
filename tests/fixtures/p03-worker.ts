import {environment,createRequest,header} from './p03-support';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const [directory,mode,label,selected]=process.argv.slice(2);
const env=environment(directory,stage=>{if(mode==='crash'&&stage===selected){writeFileSync(join(directory,'.fault-observed'),stage,{mode:0o600});process.kill(process.pid,'SIGKILL');}});
const projects=await env.repo.list(env.context,{...header,cursor:null});
if(projects.kind!=='project-page'||projects.projects.length!==1)throw Error('WORKER_FIXTURE_PROJECT');
const project=projects.projects[0];process.send?.({kind:'ready',head:project.revision.id});
process.once('message',async message=>{
 if(message!=='go')throw Error('WORKER_PROTOCOL');const same=mode==='same-key';
 const result=mode==='create-same-key'?await env.repo.create(env.context,createRequest('concurrent-create','Same created project')):await env.repo.updateMetadata(env.context,{...header,projectId:project.projectId,expectedRevision:project.revision,idempotencyKey:same?'concurrent-key':'key-'+label,metadata:createRequest('unused',same?'Same update':'Update '+label).metadata});
 process.send?.({kind:'result',result});env.store.close();process.disconnect();
});
