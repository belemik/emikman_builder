import { decodeProjectCommandTestOnly } from '../../server/projects/decode-project-command';
import { createRequest } from './p03-support';
const mode=process.argv[2];
if(mode==='spin') {process.send?.({kind:'spinning'});while(true){/* external parent timeout preempts child */}}
if(mode!=='measure')throw Error('EXPLICIT_FIXTURE_REQUIRED');
const requests=[JSON.stringify(createRequest()),JSON.stringify(createRequest('unicode','😀 e\u0301')),JSON.stringify({...createRequest(),metadata:{...createRequest().metadata,description:'x'.repeat(32768)}}),'['.repeat(10000)+'0'+']'.repeat(10000),'x'.repeat(262145)];
const rows=[];
for(const raw of requests) {
 const bytes=new TextEncoder().encode(raw),cpu=process.cpuUsage(),start=performance.now();let kind='';
 for(let i=0;i<20;i++)kind=decodeProjectCommandTestOnly('create-project',bytes).kind;
 const delta=process.cpuUsage(cpu);
 rows.push({inputBytes:bytes.byteLength,iterations:20,kind,wallMs:performance.now()-start,cpuUserUs:delta.user,cpuSystemUs:delta.system});
}
process.send?.({kind:'measurement',scope:'LOCAL_CHILD_OBSERVATION_NOT_PRODUCTION',node:process.version,sqlite:process.versions.sqlite,platform:process.platform,arch:process.arch,rows,maxRssKiB:process.resourceUsage().maxRSS,rssBytes:process.memoryUsage().rss,heapUsedBytes:process.memoryUsage().heapUsed});
process.disconnect?.();
