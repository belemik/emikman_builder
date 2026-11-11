import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessProjectEnvelope, hasEntityIdShape, hasGoalIdShape } from '../src/projects/compatibility';
import { PROJECT_DEFINITIONS as registry } from '../src/projects/definitions';
import type { CreationMode, EntityKind, ImmutableRevisionRef, ProjectEnvelopeMetadataCandidate,
  ProjectEnvelopeAssessment, WorkEnvelopeV1 } from '../src/projects/envelope.types';

const id = (prefix: string, n = 1) => `${prefix}_${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
const fmt = { id: 'format:wdeaf-screen-v3', definitionVersion: '1.0.0' };
function fixture(): ProjectEnvelopeMetadataCandidate {
  return { modelId: 'zarya.project-envelope', modelVersion: '1.0.0', registry: { id: registry.id, version: registry.version },
    project: { id: id('prj'), name: 'Fixture', description: 'Trusted metadata only', defaultProductRef: null,
      permittedSourceIds: [id('src')], workIds: [id('wrk')], currentRevisionRef: null },
    works: [{ id: id('wrk'), projectId: id('prj'), name: 'Work', creationMode: 'scratch', redesignBaselineSourceId: null,
      goals: [{ id: 'goal-1', product: { id: 'product:web-application', definitionVersion: '1.0.0' },
        target: { id: 'target:web-browser', definitionVersion: '1.0.0' }, format: { ...fmt } }], documentIds: [id('doc')] }],
    documents: [{ id: id('doc'), projectId: id('prj'), workId: id('wrk'), name: 'Screen', goalId: 'goal-1', format: { ...fmt }, revisionRef: null }] };
}
function withWork(patch: Partial<WorkEnvelopeV1>): ProjectEnvelopeMetadataCandidate {
  const value = fixture(); return { ...value, works: [{ ...value.works[0], ...patch }] };
}
const check = (v: ProjectEnvelopeMetadataCandidate) => assessProjectEnvelope(v, registry);
function has(result: ProjectEnvelopeAssessment, code: string, path?: string) {
  assert.ok(result.diagnostics.some(d => d.code === code && (path === undefined || d.path === path)), `${code} ${path ?? ''}`);
  assert.notEqual(result.metadataCompatibility, 'RECOGNIZED');
}

test('P01 coherent envelope recognition grants no admission, identity proof or execution', () => {
  const result = check(fixture()); assert.equal(result.metadataCompatibility, 'RECOGNIZED');
  assert.deepEqual(result.diagnostics, []); assert.equal(result.scope, 'P01_METADATA_ONLY');
  assert.equal(result.executionPermission, 'NOT_GRANTED'); assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
  assert.equal(result.trustedAdmission, 'NOT_IMPLEMENTED'); assert.equal(result.sourceResolution, 'NOT_EVALUATED');
  assert.equal(result.apply, 'UNSUPPORTED'); assert.equal('value' in result, false);
});
test('P01 all D01 entity prefixes accept UUIDv4 shapes without issuing IDs', () => {
  const cases: readonly [EntityKind, string][] = [['project','prj'],['work','wrk'],['document','doc'],['project-revision','prv'],['document-revision','drv'],['artifact','art'],['source','src'],['design-profile','dpf'],['brand-profile','bpf']];
  for (const [kind, prefix] of cases) {
    assert.equal(hasEntityIdShape(id(prefix), kind), true);
    for (const wrong of [id(prefix).toUpperCase(), id(prefix)+'\n', id(prefix).replace('-4000-', '-1000-'), id(prefix).replace('-8000-', '-7000-'), 'mock:1', '__proto__', 'constructor', 'toString', '../'+id(prefix), id('wrong')]) assert.equal(hasEntityIdShape(wrong, kind), false);
  }
});
test('P01 Goal IDs are local positive decimal strings, not zero or normalized input', () => {
  for (const v of ['goal-1','goal-20','goal-999999999999999999999999999']) assert.equal(hasGoalIdShape(v), true);
  for (const v of ['goal-0','goal-01','goal--1','goal-1\n',' goal-1','GOAL-1','goal-1.5']) assert.equal(hasGoalIdShape(v), false);
});
test('P01 unknown model and registry identities/versions are explicit UNKNOWN', () => {
  const v=fixture();
  for (const candidate of [{...v,modelId:'other'}, {...v,modelVersion:'latest'}, {...v,registry:{...v.registry,id:'other'}}, {...v,registry:{...v.registry,version:'1.0.0'}}]) {
    const result=check(candidate); assert.equal(result.metadataCompatibility,'UNKNOWN'); assert.equal(result.executionPermission,'NOT_GRANTED');
  }
  const result=check({...v,registry:{...v.registry,version:'latest'}});
  assert.ok(result.goals.every(g=>g.combinationCheck==='NOT_EVALUATED' && Object.values(g.definitionChecks).every(x=>x==='UNKNOWN')));
});
test('P01 invalid entity ID and foreign Project references are rejected independently', () => {
  const v=fixture(); has(check({...v,project:{...v.project,id:'__proto__'}}),'PROJECT_ID_SHAPE','/project/id');
  has(check(withWork({projectId:id('prj',2)})),'PROJECT_REF_SCOPE','/works/0/projectId');
  has(check({...v,documents:[{...v.documents[0],projectId:id('prj',2)}]}),'PROJECT_REF_SCOPE','/documents/0/projectId');
});
test('P01 duplicate entity identities and duplicate reference lists cannot overwrite each other', () => {
  const v=fixture();
  has(check({...v,works:[...v.works,v.works[0]]}),'PROJECT_ID_DUPLICATE');
  has(check({...v,documents:[...v.documents,v.documents[0]]}),'PROJECT_ID_DUPLICATE');
  has(check({...v,project:{...v.project,workIds:[id('wrk'),id('wrk')]}}),'PROJECT_ID_DUPLICATE');
  has(check({...v,project:{...v.project,permittedSourceIds:[id('src'),id('src')]}}),'PROJECT_ID_DUPLICATE');
  has(check(withWork({documentIds:[id('doc'),id('doc')]})),'PROJECT_ID_DUPLICATE');
});
test('P01 Project-Work membership is checked in both directions', () => {
  const v=fixture();has(check({...v,project:{...v.project,workIds:[]}}),'PROJECT_REF_MISSING','/works/0/id');
  has(check({...v,works:[]}),'PROJECT_REF_MISSING','/project/workIds/0');
});
test('P01 Work-Document membership and parent references are checked in both directions', () => {
  const v=fixture();has(check(withWork({documentIds:[]})),'PROJECT_REF_MISSING','/documents/0/id');
  has(check({...v,documents:[]}),'PROJECT_REF_MISSING','/works/0/documentIds/0');
  has(check({...v,documents:[{...v.documents[0],workId:id('wrk',2)}]}),'PROJECT_REF_MISSING','/documents/0/workId');
  const other={...v.works[0],id:id('wrk',2),documentIds:[id('doc')]};
  has(check({...v,project:{...v.project,workIds:[id('wrk'),other.id]},works:[...v.works,other]}),'PROJECT_REF_SCOPE','/works/1/documentIds/0');
});
test('P01 goal shape, duplicate IDs, missing goal and exact document format are checked', () => {
  const v=fixture(),g=v.works[0].goals[0];
  has(check(withWork({goals:[{...g,id:'goal-01'}]})),'PROJECT_ID_SHAPE');
  has(check(withWork({goals:[g,g]})),'PROJECT_ID_DUPLICATE');
  has(check({...v,documents:[{...v.documents[0],goalId:'goal-2'}]}),'PROJECT_REF_MISSING','/documents/0/goalId');
  has(check({...v,documents:[{...v.documents[0],format:{...fmt,definitionVersion:'other'}}]}),'PROJECT_FORMAT_MISMATCH');
});
test('P01 local goal IDs may repeat across separate Works', () => {
  const v=fixture();const work={...v.works[0],id:id('wrk',2),documentIds:[]};
  const result=check({...v,project:{...v.project,workIds:[id('wrk'),work.id]},works:[...v.works,work]});
  assert.equal(result.metadataCompatibility,'RECOGNIZED'); assert.equal(result.goals.length,2);
});
test('P01 redesign baseline is metadata only; no source resolution or access claim', () => {
  const result=check(withWork({creationMode:'redesign',redesignBaselineSourceId:id('src')}));
  assert.equal(result.metadataCompatibility,'RECOGNIZED');assert.equal(result.sourceResolution,'NOT_EVALUATED');assert.equal(result.executionPermission,'NOT_GRANTED');
  has(check(withWork({creationMode:'redesign',redesignBaselineSourceId:null})),'PROJECT_REDESIGN_BASELINE_MISSING');
  assert.equal(check(withWork({creationMode:'redesign',redesignBaselineSourceId:null})).metadataCompatibility,'INCOMPLETE');
  has(check(withWork({redesignBaselineSourceId:id('src',2)})),'PROJECT_REF_MISSING');
  has(check(withWork({redesignBaselineSourceId:'https://example.test'})),'PROJECT_ID_SHAPE');
});
test('P01 defaultProductRef names conceptual defaultProjectType but never supplies a goal', () => {
  const v=fixture();const defaultProductRef={id:'product:mobile-app',definitionVersion:'1.0.0'};
  const result=check({...v,project:{...v.project,defaultProductRef}});assert.equal(result.metadataCompatibility,'RECOGNIZED');
  assert.equal(result.goals[0].definitionChecks.product,'PASS');assert.equal('defaultProjectType' in v.project,false);
  const empty={...v,project:{...v.project,defaultProductRef},works:[{...v.works[0],goals:[],documentIds:[]}],documents:[]};
  assert.equal(check(empty).metadataCompatibility,'INCOMPLETE');assert.equal(check(empty).goals.length,0);
  assert.equal(check({...v,project:{...v.project,defaultProductRef:{id:'product:invented',definitionVersion:'1.0.0'}}}).metadataCompatibility,'UNKNOWN');
});
test('P01 empty Project metadata is allowed; an empty Work remains INCOMPLETE', () => {
  const v=fixture();assert.equal(check({...v,project:{...v.project,workIds:[]},works:[],documents:[]}).metadataCompatibility,'RECOGNIZED');
  assert.equal(check({...v,works:[{...v.works[0],goals:[],documentIds:[]}],documents:[]}).metadataCompatibility,'INCOMPLETE');
});
test('P01 revision declarations check kind, prefix, self-parent and integrity shape, not digests', () => {
  const v=fixture();const ref:ImmutableRevisionRef={kind:'project',id:id('prv'),parentId:null,integrity:{algorithm:'sha256',encoding:'hex-lower',byteDomain:'zarya.project-manifest.jcs/v1',value:'a'.repeat(64)}};
  const result=check({...v,project:{...v.project,currentRevisionRef:ref}});assert.equal(result.metadataCompatibility,'RECOGNIZED');assert.equal(result.trustedAdmission,'NOT_IMPLEMENTED');
  for (const bad of [{...ref,kind:'document' as const},{...ref,parentId:ref.id},{...ref,integrity:{...ref.integrity!,value:'A'.repeat(64)}},{...ref,integrity:{...ref.integrity!,byteDomain:'raw-bytes'}}]) has(check({...v,project:{...v.project,currentRevisionRef:bad}}),'PROJECT_REVISION_REF');
  has(check({...v,project:{...v.project,currentRevisionRef:{...ref,id:id('drv')}}}),'PROJECT_ID_SHAPE');
  assert.equal(check({...v,project:{...v.project,currentRevisionRef:{...ref,integrity:null}}}).metadataCompatibility,'INCOMPLETE');
});
test('P01 unknown definitions do not hide independent structural errors', () => {
  const v=withWork({projectId:id('prj',2)});const candidate={...v,registry:{...v.registry,version:'unknown'}};
  const result=check(candidate);assert.equal(result.metadataCompatibility,'UNSUPPORTED');has(result,'PROJECT_REF_SCOPE');has(result,'PROJECT_REGISTRY_VERSION');
  assert.equal(result.goals[0].combinationCheck,'NOT_EVALUATED');
});
test('P01 diagnostics have stable paths/reasons/alternatives and no input normalization', () => {
  const v=fixture();const x={...v,project:{...v.project,id:' '+v.project.id,name:' e\u0301\r\n '}};const before=structuredClone(x);
  const result=check(x);assert.deepEqual(x,before);assert.equal(x.project.id.startsWith(' '),true);
  for(const d of result.diagnostics){assert.ok(d.path.startsWith('/'));assert.ok(d.reason.length);assert.ok(d.alternatives.length);}
  assert.deepEqual(check(x),result);
});
