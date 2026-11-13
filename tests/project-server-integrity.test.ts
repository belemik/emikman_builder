import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createServerIdIssuer} from '../server/projects/server-identities';
import {computeManifestIntegrity,verifyManifestIntegrity} from '../server/projects/manifest-integrity';
import {hasEntityIdShape} from '../src/projects/compatibility';
import type {CanonicalProjectManifestV1} from '../src/projects/canonicalization.types';
const goldenReferences = [
  {
    "id": "G1",
    "canonicalText": "{\"canonicalizationProfile\":\"zarya.project-manifest.jcs/v1\",\"content\":{\"designDefaultsRef\":null,\"documentHeads\":[],\"metadata\":{\"defaultProjectType\":null,\"description\":\"Initial metadata\",\"name\":\"Fixture Project\"},\"permittedSourceRefs\":[],\"works\":[]},\"modelId\":\"zarya.project-envelope\",\"modelVersion\":\"1.0.0\",\"projectId\":\"prj_00000001-0000-4000-8000-000000000000\",\"revision\":{\"actorRef\":\"fixture-account\",\"createdAt\":\"2026-11-12T00:00:00.000Z\",\"id\":\"prv_00000001-0000-4000-8000-000000000000\",\"parentId\":null,\"restoreOf\":null,\"sequence\":1}}",
    "canonicalUtf8Hex": "7b2263616e6f6e6963616c697a6174696f6e50726f66696c65223a227a617279612e70726f6a6563742d6d616e69666573742e6a63732f7631222c22636f6e74656e74223a7b2264657369676e44656661756c7473526566223a6e756c6c2c22646f63756d656e744865616473223a5b5d2c226d65746164617461223a7b2264656661756c7450726f6a65637454797065223a6e756c6c2c226465736372697074696f6e223a22496e697469616c206d65746164617461222c226e616d65223a22466978747572652050726f6a656374227d2c227065726d6974746564536f7572636552656673223a5b5d2c22776f726b73223a5b5d7d2c226d6f64656c4964223a227a617279612e70726f6a6563742d656e76656c6f7065222c226d6f64656c56657273696f6e223a22312e302e30222c2270726f6a6563744964223a2270726a5f30303030303030312d303030302d343030302d383030302d303030303030303030303030222c227265766973696f6e223a7b226163746f72526566223a22666978747572652d6163636f756e74222c22637265617465644174223a22323032362d31312d31325430303a30303a30302e3030305a222c226964223a227072765f30303030303030312d303030302d343030302d383030302d303030303030303030303030222c22706172656e744964223a6e756c6c2c22726573746f72654f66223a6e756c6c2c2273657175656e6365223a317d7d",
    "canonicalUtf8Bytes": 536,
    "manifestPreimageBytes": 566,
    "expectedManifestDigest": "fb6874e8d0e6981b8af01b579bfd4408cedde1191bfb78443feb02dfd3a20a91"
  },
  {
    "id": "G2",
    "canonicalText": "{\"canonicalizationProfile\":\"zarya.project-manifest.jcs/v1\",\"content\":{\"designDefaultsRef\":null,\"documentHeads\":[],\"metadata\":{\"defaultProjectType\":null,\"description\":\"Keep \\r\\n é unchanged\",\"name\":\"Metadata fixture\"},\"permittedSourceRefs\":[],\"works\":[]},\"modelId\":\"zarya.project-envelope\",\"modelVersion\":\"1.0.0\",\"projectId\":\"prj_00000001-0000-4000-8000-000000000000\",\"revision\":{\"actorRef\":\"fixture-account\",\"createdAt\":\"2026-11-12T00:00:00.000Z\",\"id\":\"prv_00000001-0000-4000-8000-000000000000\",\"parentId\":null,\"restoreOf\":null,\"sequence\":1}}",
    "canonicalUtf8Hex": "7b2263616e6f6e6963616c697a6174696f6e50726f66696c65223a227a617279612e70726f6a6563742d6d616e69666573742e6a63732f7631222c22636f6e74656e74223a7b2264657369676e44656661756c7473526566223a6e756c6c2c22646f63756d656e744865616473223a5b5d2c226d65746164617461223a7b2264656661756c7450726f6a65637454797065223a6e756c6c2c226465736372697074696f6e223a224b656570205c725c6e2065cc8120756e6368616e676564222c226e616d65223a224d657461646174612066697874757265227d2c227065726d6974746564536f7572636552656673223a5b5d2c22776f726b73223a5b5d7d2c226d6f64656c4964223a227a617279612e70726f6a6563742d656e76656c6f7065222c226d6f64656c56657273696f6e223a22312e302e30222c2270726f6a6563744964223a2270726a5f30303030303030312d303030302d343030302d383030302d303030303030303030303030222c227265766973696f6e223a7b226163746f72526566223a22666978747572652d6163636f756e74222c22637265617465644174223a22323032362d31312d31325430303a30303a30302e3030305a222c226964223a227072765f30303030303030312d303030302d343030302d383030302d303030303030303030303030222c22706172656e744964223a6e756c6c2c22726573746f72654f66223a6e756c6c2c2273657175656e6365223a317d7d",
    "canonicalUtf8Bytes": 544,
    "manifestPreimageBytes": 574,
    "expectedManifestDigest": "e31d19ffd697ea54f46eb426a4d4788761986c09097f7577ab4a6331a3a2cf84"
  },
  {
    "id": "G3",
    "canonicalText": "{\"canonicalizationProfile\":\"zarya.project-manifest.jcs/v1\",\"content\":{\"designDefaultsRef\":null,\"documentHeads\":[],\"metadata\":{\"defaultProjectType\":{\"definitionVersion\":\"1.0.0\",\"id\":\"product:mobile-app\"},\"description\":\"Keep \\r\\n é unchanged\",\"name\":\"Metadata fixture\"},\"permittedSourceRefs\":[],\"works\":[]},\"modelId\":\"zarya.project-envelope\",\"modelVersion\":\"1.0.0\",\"projectId\":\"prj_00000001-0000-4000-8000-000000000000\",\"revision\":{\"actorRef\":\"fixture-account\",\"createdAt\":\"2026-11-12T00:00:00.000Z\",\"id\":\"prv_00000001-0000-4000-8000-000000000000\",\"parentId\":null,\"restoreOf\":null,\"sequence\":1}}",
    "canonicalUtf8Hex": "7b2263616e6f6e6963616c697a6174696f6e50726f66696c65223a227a617279612e70726f6a6563742d6d616e69666573742e6a63732f7631222c22636f6e74656e74223a7b2264657369676e44656661756c7473526566223a6e756c6c2c22646f63756d656e744865616473223a5b5d2c226d65746164617461223a7b2264656661756c7450726f6a65637454797065223a7b22646566696e6974696f6e56657273696f6e223a22312e302e30222c226964223a2270726f647563743a6d6f62696c652d617070227d2c226465736372697074696f6e223a224b656570205c725c6e2065cc8120756e6368616e676564222c226e616d65223a224d657461646174612066697874757265227d2c227065726d6974746564536f7572636552656673223a5b5d2c22776f726b73223a5b5d7d2c226d6f64656c4964223a227a617279612e70726f6a6563742d656e76656c6f7065222c226d6f64656c56657273696f6e223a22312e302e30222c2270726f6a6563744964223a2270726a5f30303030303030312d303030302d343030302d383030302d303030303030303030303030222c227265766973696f6e223a7b226163746f72526566223a22666978747572652d6163636f756e74222c22637265617465644174223a22323032362d31312d31325430303a30303a30302e3030305a222c226964223a227072765f30303030303030312d303030302d343030302d383030302d303030303030303030303030222c22706172656e744964223a6e756c6c2c22726573746f72654f66223a6e756c6c2c2273657175656e6365223a317d7d",
    "canonicalUtf8Bytes": 595,
    "manifestPreimageBytes": 625,
    "expectedManifestDigest": "7076c63600192a7b03b26ad8596a0cc2a60a68d00bfbfe2e276ff32c9649e8b4"
  },
  {
    "id": "G4-NFC",
    "canonicalText": "{\"canonicalizationProfile\":\"zarya.project-manifest.jcs/v1\",\"content\":{\"designDefaultsRef\":null,\"documentHeads\":[],\"metadata\":{\"defaultProjectType\":null,\"description\":\"Initial metadata\",\"name\":\"Café\"},\"permittedSourceRefs\":[],\"works\":[]},\"modelId\":\"zarya.project-envelope\",\"modelVersion\":\"1.0.0\",\"projectId\":\"prj_00000001-0000-4000-8000-000000000000\",\"revision\":{\"actorRef\":\"fixture-account\",\"createdAt\":\"2026-11-12T00:00:00.000Z\",\"id\":\"prv_00000001-0000-4000-8000-000000000000\",\"parentId\":null,\"restoreOf\":null,\"sequence\":1}}",
    "canonicalUtf8Hex": "7b2263616e6f6e6963616c697a6174696f6e50726f66696c65223a227a617279612e70726f6a6563742d6d616e69666573742e6a63732f7631222c22636f6e74656e74223a7b2264657369676e44656661756c7473526566223a6e756c6c2c22646f63756d656e744865616473223a5b5d2c226d65746164617461223a7b2264656661756c7450726f6a65637454797065223a6e756c6c2c226465736372697074696f6e223a22496e697469616c206d65746164617461222c226e616d65223a22436166c3a9227d2c227065726d6974746564536f7572636552656673223a5b5d2c22776f726b73223a5b5d7d2c226d6f64656c4964223a227a617279612e70726f6a6563742d656e76656c6f7065222c226d6f64656c56657273696f6e223a22312e302e30222c2270726f6a6563744964223a2270726a5f30303030303030312d303030302d343030302d383030302d303030303030303030303030222c227265766973696f6e223a7b226163746f72526566223a22666978747572652d6163636f756e74222c22637265617465644174223a22323032362d31312d31325430303a30303a30302e3030305a222c226964223a227072765f30303030303030312d303030302d343030302d383030302d303030303030303030303030222c22706172656e744964223a6e756c6c2c22726573746f72654f66223a6e756c6c2c2273657175656e6365223a317d7d",
    "canonicalUtf8Bytes": 526,
    "manifestPreimageBytes": 556,
    "expectedManifestDigest": "0164e60f735ae3e2207b391c47a71524b19243d8e36d364366e67f6fac625669"
  },
  {
    "id": "G4-NFD",
    "canonicalText": "{\"canonicalizationProfile\":\"zarya.project-manifest.jcs/v1\",\"content\":{\"designDefaultsRef\":null,\"documentHeads\":[],\"metadata\":{\"defaultProjectType\":null,\"description\":\"Initial metadata\",\"name\":\"Café\"},\"permittedSourceRefs\":[],\"works\":[]},\"modelId\":\"zarya.project-envelope\",\"modelVersion\":\"1.0.0\",\"projectId\":\"prj_00000001-0000-4000-8000-000000000000\",\"revision\":{\"actorRef\":\"fixture-account\",\"createdAt\":\"2026-11-12T00:00:00.000Z\",\"id\":\"prv_00000001-0000-4000-8000-000000000000\",\"parentId\":null,\"restoreOf\":null,\"sequence\":1}}",
    "canonicalUtf8Hex": "7b2263616e6f6e6963616c697a6174696f6e50726f66696c65223a227a617279612e70726f6a6563742d6d616e69666573742e6a63732f7631222c22636f6e74656e74223a7b2264657369676e44656661756c7473526566223a6e756c6c2c22646f63756d656e744865616473223a5b5d2c226d65746164617461223a7b2264656661756c7450726f6a65637454797065223a6e756c6c2c226465736372697074696f6e223a22496e697469616c206d65746164617461222c226e616d65223a2243616665cc81227d2c227065726d6974746564536f7572636552656673223a5b5d2c22776f726b73223a5b5d7d2c226d6f64656c4964223a227a617279612e70726f6a6563742d656e76656c6f7065222c226d6f64656c56657273696f6e223a22312e302e30222c2270726f6a6563744964223a2270726a5f30303030303030312d303030302d343030302d383030302d303030303030303030303030222c227265766973696f6e223a7b226163746f72526566223a22666978747572652d6163636f756e74222c22637265617465644174223a22323032362d31312d31325430303a30303a30302e3030305a222c226964223a227072765f30303030303030312d303030302d343030302d383030302d303030303030303030303030222c22706172656e744964223a6e756c6c2c22726573746f72654f66223a6e756c6c2c2273657175656e6365223a317d7d",
    "canonicalUtf8Bytes": 527,
    "manifestPreimageBytes": 557,
    "expectedManifestDigest": "b8a8284e4091f91dfa5428b6c69127cec67c8658f58ea0c379dea0eadae33407"
  }
];
function fixture(name='Fixture Project', description='Initial metadata', product=false): CanonicalProjectManifestV1 {
 return {modelId:'zarya.project-envelope',modelVersion:'1.0.0',canonicalizationProfile:'zarya.project-manifest.jcs/v1',
 projectId:'prj_00000001-0000-4000-8000-000000000000',revision:{id:'prv_00000001-0000-4000-8000-000000000000',parentId:null,sequence:1,createdAt:'2026-11-12T00:00:00.000Z',actorRef:'fixture-account',restoreOf:null},
 content:{metadata:{name,description,defaultProjectType:product?{id:'product:mobile-app',definitionVersion:'1.0.0'}:null},works:[],documentHeads:[],permittedSourceRefs:[],designDefaultsRef:null}};
}
for(const golden of goldenReferences) test('S1c domain-separated golden '+golden.id,()=>{
 const name=golden.id==='G4-NFC'?'Caf\u00e9':golden.id==='G4-NFD'?'Cafe\u0301':golden.id==='G2'||golden.id==='G3'?'Metadata fixture':'Fixture Project';
 const manifest=fixture(name,golden.id==='G2'||golden.id==='G3'?'Keep \r\n e\u0301 unchanged':'Initial metadata',golden.id==='G3');
 const result=computeManifestIntegrity(manifest);assert.equal(result.kind,'manifest-integrity');
 if(result.kind!=='manifest-integrity')throw Error('fixture');
 assert.equal(result.integrity.value,golden.expectedManifestDigest);assert.equal(Buffer.from(result.canonicalText).toString('hex'),golden.canonicalUtf8Hex);
 assert.equal(verifyManifestIntegrity(manifest,result.integrity).kind,'integrity-verified');
 assert.equal(result.executionPermission,'NOT_GRANTED');assert.equal(result.persistencePermission,'NOT_GRANTED');
});
test('S1c key order invariant, metadata mutation changes hash, no input mutation',()=>{
 const f=fixture();const before=JSON.stringify(f);const a=computeManifestIntegrity(f);
 const {revision,...rest}=f;assert.deepEqual(a,computeManifestIntegrity({revision,...rest}));assert.equal(JSON.stringify(f),before);
 assert.notDeepEqual(a,computeManifestIntegrity(fixture('changed')));
});
test('S1c wrong digest/domain and unknown profile/version fail closed',()=>{
 const f=fixture();const a=computeManifestIntegrity(f);if(a.kind!=='manifest-integrity')throw Error('fixture');
 for(const integrity of [{...a.integrity,value:'0'.repeat(64)},{...a.integrity,value:'F'.repeat(64)},{...a.integrity,value:a.integrity.value+'\n'},{...a.integrity,byteDomain:'raw-bytes'}])assert.equal(verifyManifestIntegrity(f,integrity).kind,'integrity-error');
 assert.equal(computeManifestIntegrity({...f,modelVersion:'future'}).kind,'canonicalization-error');
 assert.equal(computeManifestIntegrity({...f,canonicalizationProfile:'future'}).kind,'canonicalization-error');
 assert.equal(computeManifestIntegrity(fixture('\ud800')).kind,'canonicalization-error');
});
test('S1c CSPRNG IDs have approved shape and 10000 allocations are distinct',()=>{
 const issuer=createServerIdIssuer();const ids=Array.from({length:10000},()=>issuer.next('project'));
 assert.equal(new Set(ids).size,10000);assert.ok(ids.every(id=>hasEntityIdShape(id,'project')));
 assert.ok(hasEntityIdShape(issuer.next('project-revision'),'project-revision'));
});
test('S1c duplicate allocation and invalid RNG fail, rather than silently reuse IDs',()=>{
 const issuer=createServerIdIssuer(()=> '00000001-0000-4000-8000-000000000000');issuer.next('project');
 assert.throws(()=>issuer.next('project'),/COLLISION/);assert.throws(()=>createServerIdIssuer(()=> 'bad').next('project'),/INVALID/);
});
test('S1c hash module has no clock, RNG or IO; no second JCS implementation',()=>{
 const s=readFileSync(new URL('../server/projects/manifest-integrity.ts',import.meta.url),'utf8');
 assert.doesNotMatch(s,/Date\.|randomUUID|Math\.random|node:fs|fetch\(|JSON\.parse|JSON\.stringify/);
 assert.match(s,/canonicalizeProjectManifest/);
});

test('S1c every D01 entity prefix and source failure are explicit',()=>{
 const issuer=createServerIdIssuer();for(const kind of ['project','work','document','project-revision','document-revision','artifact','source','design-profile','brand-profile'] as const)assert.equal(hasEntityIdShape(issuer.next(kind),kind),true);
 assert.throws(()=>createServerIdIssuer(()=>{throw Error('sensitive test source error');}).next('project'),/ID_SOURCE_UNAVAILABLE/);
});
