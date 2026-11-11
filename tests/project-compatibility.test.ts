import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessProjectCapability, assessProjectEnvelope } from '../src/projects/compatibility';
import { CAPABILITY_ACTIONS, PROJECT_DEFINITIONS as registry } from '../src/projects/definitions';
import type { CreationMode, DefinitionRef, Goal, ProjectEnvelopeMetadataCandidate,
  ProjectDefinitionRegistryV1 } from '../src/projects/envelope.types';
const id=(prefix:string,n=1)=>`${prefix}_${n.toString(16).padStart(8,'0')}-0000-4000-8000-000000000000`;
function ref(value:string):DefinitionRef {
  const d=[...registry.products,...registry.targets,...registry.formats].find(x=>x.id===value);
  assert.ok(d);return {id:d.id,definitionVersion:d.definitionVersion};
}
function fixture(product='web-application',target='web-browser',format='wdeaf-screen-v3',mode:CreationMode='scratch'):ProjectEnvelopeMetadataCandidate {
  return {modelId:'zarya.project-envelope',modelVersion:'1.0.0',registry:{id:registry.id,version:registry.version},
    project:{id:id('prj'),name:'Only metadata',description:'',defaultProductRef:null,permittedSourceIds:[id('src')],workIds:[id('wrk')],currentRevisionRef:null},
    works:[{id:id('wrk'),projectId:id('prj'),name:'Work',creationMode:mode,redesignBaselineSourceId:mode==='redesign'?id('src'):null,
      goals:[{id:'goal-1',product:ref('product:'+product),target:ref('target:'+target),format:ref('format:'+format)}],documentIds:[id('doc')]}],
    documents:[{id:id('doc'),projectId:id('prj'),workId:id('wrk'),name:'Document',goalId:'goal-1',format:ref('format:'+format),revisionRef:null}]};
}
const tuples=[
 ['web-application','web-browser','wdeaf-screen-v3'],['web-application','web-browser','web-product-placeholder'],
 ['landing-page','web-browser','wdeaf-screen-v3'],['landing-page','web-browser','web-product-placeholder'],
 ['mobile-app','android','android-project-placeholder'],['mobile-app','ios','ios-project-placeholder'],
 ['presentation','unspecified','presentation-deck-placeholder'],['interactive-terminal','terminal-runtime-unresolved','terminal-package-placeholder'],
 ['image-creative','digital-canvas','raster-image-placeholder'],['image-creative','digital-canvas','vector-layout-placeholder'],
 ['video-animation','digital-canvas','video-animation-placeholder'],['print-layout','print-output','print-layout-placeholder'],
 ['marketplace-card','marketplace','raster-image-placeholder'],
];
for(const [product,target,format] of tuples)for(const mode of ['scratch','redesign'] as const)
 test(`P01 approved tuple ${product}/${target}/${format} in ${mode} recognizes metadata only`,()=>{
  const result=assessProjectEnvelope(fixture(product,target,format,mode),registry);
  assert.equal(result.metadataCompatibility,'RECOGNIZED');assert.deepEqual(result.diagnostics,[]);
  assert.equal(result.goals[0].combinationCheck,'PASS');assert.deepEqual(result.goals[0].definitionChecks,{product:'PASS',target:'PASS',format:'PASS'});
  assert.equal(result.executionPermission,'NOT_GRANTED');assert.equal(result.apply,'UNSUPPORTED');assert.equal(result.sourceResolution,'NOT_EVALUATED');
  assert.equal(result.goals[0].capabilities.length,8);
  assert.ok(result.goals[0].capabilities.every(c=>c.availability==='unsupported'&&c.executionPermission==='NOT_GRANTED'));
 });
function changeGoal(value:ProjectEnvelopeMetadataCandidate,patch:Partial<Goal>):ProjectEnvelopeMetadataCandidate {
 return {...value,works:[{...value.works[0],goals:[{...value.works[0].goals[0],...patch}]}]};
}
test('P01 unknown definition identities and versions remain UNKNOWN, without Web fallback',()=>{
 for(const kind of ['product','target','format'] as const)for(const unknown of ['__proto__','constructor','toString','invented']) {
  const value=fixture();const result=assessProjectEnvelope(changeGoal(value,{[kind]:{id:unknown,definitionVersion:'1.0.0'}}),registry);
  assert.equal(result.metadataCompatibility,kind==='format'?'UNSUPPORTED':'UNKNOWN'); // Document format still mismatches an altered goal format.
  assert.equal(result.goals[0].definitionChecks[kind],'UNKNOWN');assert.equal(result.goals[0].combinationCheck,'NOT_EVALUATED');
  assert.ok(result.diagnostics.some(d=>d.code==='PROJECT_DEFINITION_UNKNOWN'&&d.path===`/works/0/goals/0/${kind}`));
 }
 for(const kind of ['product','target','format'] as const)for(const version of ['latest','1.0','1.0.0 ','9.0.0']) {
  const value=fixture(),g=value.works[0].goals[0];const altered=changeGoal(value,{[kind]:{...g[kind],definitionVersion:version}});
  const result=assessProjectEnvelope(altered,registry);assert.equal(result.goals[0].combinationCheck,'NOT_EVALUATED');assert.equal(result.goals[0].definitionChecks[kind],'UNKNOWN');
 }
});
test('P01 known cross-platform tuples and derived/reference roles are explicitly unsupported',()=>{
 for(const [p,t,f] of [['mobile-app','android','wdeaf-screen-v3'],['mobile-app','ios','android-project-placeholder'],['landing-page','ios','web-product-placeholder'],['web-application','web-browser','raster-image-placeholder'],['image-creative','digital-canvas','analysis-report-placeholder'],['image-creative','digital-canvas','knowledge-reference-placeholder']]) {
  const result=assessProjectEnvelope(fixture(p,t,f),registry);assert.equal(result.metadataCompatibility,'UNSUPPORTED');assert.equal(result.goals[0].combinationCheck,'FAIL');
  assert.ok(result.diagnostics.some(d=>d.code==='PROJECT_COMBINATION_UNSUPPORTED'));assert.equal(result.executionPermission,'NOT_GRANTED');
 }
});
test('P01 no inference from a default Product or a Source label',()=>{
 const value=fixture();const unknown=changeGoal({...value,project:{...value.project,defaultProductRef:ref('product:web-application')}},{product:{id:'product:unknown',definitionVersion:'1.0.0'}});
 const result=assessProjectEnvelope(unknown,registry);assert.equal(result.metadataCompatibility,'UNKNOWN');assert.equal(result.goals[0].definitionChecks.product,'UNKNOWN');
 const mode=fixture();Reflect.set(mode.works[0],'creationMode','figma');
 assert.ok(assessProjectEnvelope(mode,registry).diagnostics.some(d=>d.code==='PROJECT_MODE_UNSUPPORTED'));
});
test('P01 exact snapshot clone is accepted; modified data cannot self-register at the same version',()=>{
 const clone=structuredClone(registry);assert.equal(assessProjectEnvelope(fixture(),clone).metadataCompatibility,'RECOGNIZED');
 const extra:ProjectDefinitionRegistryV1={...registry,formats:[...registry.formats,{...registry.formats[0],id:'format:invented'}]};
 const modified:ProjectDefinitionRegistryV1={...registry,goalTuples:[...registry.goalTuples,{productId:'product:mobile-app',targetId:'target:android',formatId:'format:wdeaf-screen-v3'}]};
 const forged:ProjectDefinitionRegistryV1={...registry,formats:registry.formats.map((d,i)=>i?d:{...d,capabilities:d.capabilities.map(c=>c.scope==='project'?{...c,availability:'partial'}:c)})};
 for(const changed of [extra,modified,forged]) {
  const result=assessProjectEnvelope(fixture(),changed);assert.equal(result.metadataCompatibility,'UNKNOWN');assert.equal(result.goals[0].combinationCheck,'NOT_EVALUATED');
  assert.ok(result.diagnostics.some(d=>d.code==='PROJECT_REGISTRY_SNAPSHOT'));assert.ok(result.goals[0].capabilities.every(c=>c.availability==='unknown'&&c.executionPermission==='NOT_GRANTED'));
 }
});
test('P01 Apply, Analysis, Generation and all other Project actions never inherit legacy capability',()=>{
 for(const format of registry.formats)for(const action of CAPABILITY_ACTIONS) {
  const result=assessProjectCapability(format,action,registry);assert.equal(result.scope,'project');assert.equal(result.availability,'unsupported');assert.equal(result.executionPermission,'NOT_GRANTED');
  assert.equal(result.semanticAdmission,'NOT_EVALUATED');assert.equal(result.trustedAdmission,'NOT_IMPLEMENTED');assert.equal(result.diagnostic.code,'PROJECT_CAPABILITY_UNSUPPORTED');
 }
 for(const id of ['format:invented','__proto__','constructor','toString']) {
  const result=assessProjectCapability({id,definitionVersion:'1.0.0'},'analyze',registry);assert.equal(result.availability,'unknown');assert.equal(result.executionPermission,'NOT_GRANTED');
 }
});
test('P01 multiple explicit goals are checked as tuples, never combined implicitly',()=>{
 const value=fixture(),goal=value.works[0].goals[0];const second={...goal,id:'goal-2',product:ref('product:mobile-app'),target:ref('target:android'),format:ref('format:android-project-placeholder')};
 const result=assessProjectEnvelope({...value,works:[{...value.works[0],goals:[goal,second]}]},registry);
 assert.equal(result.metadataCompatibility,'RECOGNIZED');assert.equal(result.goals.length,2);
 assert.equal(result.goals[1].combinationCheck,'PASS');assert.equal(result.executionPermission,'NOT_GRANTED');
});
test('P01 goal-local diagnostics do not call an invalid goal recognized',()=>{
 const value=changeGoal(fixture(),{id:'goal-0'});const result=assessProjectEnvelope(value,registry);
 assert.equal(result.goals[0].metadataCompatibility,'UNSUPPORTED');
 assert.ok(result.diagnostics.some(d=>d.code==='PROJECT_ID_SHAPE'&&d.path==='/works/0/goals/0/id'));
});
function freeze<T>(value:T):T {
 if(value!==null&&typeof value==='object') {for(const child of Object.values(value))freeze(child);Object.freeze(value);}
 return value;
}
test('P01 frozen input and registry remain unchanged, repeated assessments deterministic',()=>{
 const value=freeze(fixture('image-creative','digital-canvas','vector-layout-placeholder','redesign'));
 const before=structuredClone(value),catalog=structuredClone(registry);const first=assessProjectEnvelope(value,registry);
 for(let i=0;i<5;i++)assert.deepEqual(assessProjectEnvelope(value,registry),first);
 assert.deepEqual(value,before);assert.deepEqual(registry,catalog);
 const callerResult=assessProjectEnvelope(value,registry);Reflect.set(callerResult.goals[0].capabilities[0],'reason','caller-owned change');
 assert.deepEqual(assessProjectEnvelope(value,registry),first);assert.deepEqual(value,before);assert.deepEqual(registry,catalog);
});
