import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createElement as reactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import matrix from '../design-system/library-matrix.json';
import assets from '../design-system/library-assets.json';
import fixture from '../design-system/examples/library-composition.v3.json';
import { createElement, emptyDocument } from '../src/canvas/model';
import { syncComposition } from '../src/canvas/composition';
import { validateComponent, validateScreen } from '../src/design-system';
import { prepareRender } from '../src/renderer/prepare';
import { Tag } from '../src/renderer/library';
import { DSRenderer } from '../src/renderer/DSRenderer';
import { importEditorDocument, acceptEditorDocument, strictDocument } from '../src/renderer/boundary';
import { parseDocument, loadDocument, saveDocument } from '../src/storage';
import { generatePrompt, generateRendererPrompt } from '../src/prompt';
const html=(screen:unknown)=>renderToStaticMarkup(reactElement(DSRenderer,{screen}));
test('143 source samples retain provenance; internal Tag primitives are unit-only, lawful compositions render',()=>{
 let count=0;
 for(const [component,rows] of Object.entries(matrix))for(const row of rows){
 const element={...createElement(component),variantProps:row.props};
 assert.equal(validateComponent(element).valid,true,JSON.stringify(element));
 if(component==='tag-input'||component==='tag-more'){assert.equal(validateScreen({...emptyDocument(),elements:[element]}).valid,false);assert.match(renderToStaticMarkup(reactElement(Tag,{element})),new RegExp(`data-figma-node="${row.nodeId}"`));count++;continue;}
 let owner:any=element;
 if(component==='dropdown-item')owner={...createElement('dropdown-menu'),slots:{items:[{...createElement('items-list'),variantProps:{amount:'x1',size:(element.variantProps as Record<string,unknown>).size},slots:{items:[element]}}]}};
 if(component==='hint'||component==='field-label')owner={...createElement('input'),variantProps:{size:'l',state:'default',placeholder:false},slots:{[component==='hint'?'hint':'label']:[element]}};
 if(component==='items-list')owner={...createElement('dropdown-menu'),slots:{items:[element]}};
 const screen={...emptyDocument(),elements:[owner]};
 assert.equal(prepareRender(screen).valid,true,JSON.stringify(screen));
 assert.match(html(screen),new RegExp(`data-figma-node="${row.nodeId}"`));count++;
 }
 assert.equal(count,143);
});
test('unverified combinations, internal roots, wrong slots and duplicate nested IDs fail closed',()=>{
 const bad:any[]=[];
 for(const [component,props] of [['hint',{hint:false,counter:false}],['dropdown-item',{disabled:true,hover:true}],['tag-group',{amount:'3'}]]) {const e=createElement(String(component));Object.assign(e.variantProps,props);bad.push({...emptyDocument(),elements:[e]});}
 const input:any=structuredClone(fixture.elements[0]);
 bad.push({...emptyDocument(),elements:[createElement('hint')]});
 bad.push({...emptyDocument(),elements:[{...input,slots:{hint:[createElement('chip')]}}]});
 bad.push({...emptyDocument(),elements:[{...input,slots:{...input.slots,unknown:[]}}]});
 input.slots.hint[0].id=input.id;bad.push({...emptyDocument(),elements:[input]});
 const group:any=structuredClone(fixture.elements[2]);group.slots.tags[0].variantProps.state='error';bad.push({...emptyDocument(),elements:[group]});
 for(const screen of bad){assert.equal(validateScreen(screen).valid,false);assert.doesNotMatch(html(screen),/data-ds-component=/);}
 const unsupported={...createElement('select'),variantProps:{size:'l',state:'default',placeholder:true,label:true,foldDirection:'up'}};
 assert.equal(prepareRender({...emptyDocument(),elements:[unsupported]}).valid,false);
});
test('v3 nested projects and tokenReferences survive import, edit, prompt, strict export and storage reload',()=>{
 const imported=importEditorDocument(JSON.stringify(fixture));assert.deepEqual(imported.document,fixture);
 const edited=acceptEditorDocument({...imported.document,elements:imported.document.elements.slice().reverse()});
 assert.deepEqual(edited.tokenReferences,fixture.tokenReferences);assert.deepEqual(parseDocument(JSON.stringify(edited)),edited);
 assert.deepEqual(strictDocument(edited),edited);assert.match(generatePrompt(edited),/tokenReferences/);assert.match(generateRendererPrompt(edited),/hintText/);
 const values=new Map<string,string>(),prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
 try {const old={schemaVersion:2,platform:'web',elements:[],themeOverrides:{radiusPx:8}};values.set('account-a',JSON.stringify(old));const migrated=loadDocument('account-a').document;saveDocument(migrated,'account-a');assert.equal(values.get('account-a.pre-v3-backup'),JSON.stringify(old));saveDocument(edited,'account-a');assert.deepEqual(loadDocument('account-a').document,edited);assert.equal(loadDocument('account-b').document.elements.length,0);}finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else Reflect.deleteProperty(globalThis,'localStorage');}
});
test('group amount changes keep child content and synchronize the Figma composition',()=>{
 const group:any=structuredClone(fixture.elements[2]);group.variantProps.amount='1';group.variantProps.disabled=true;
 const next=syncComposition(group);assert.equal(next.slots!.tags!.length,1);assert.equal(next.slots!.tags![0].variantProps.state,'disabled');assert.equal(validateComponent(next).valid,true);
});
test('library assets keep original checksums, root geometry and no remote runtime dependencies',()=>{
 for(const asset of Object.values(assets)){const bytes=readFileSync('public'+asset.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);const root=bytes.toString().split('>')[0];assert.ok(root.includes(`width="${asset.width}"`)&&root.includes(`height="${asset.height}"`));assert.ok(bytes.length>100);}
 assert.doesNotMatch(html(fixture),/https:\/\/www.figma.com\/api\/mcp\/asset/);
});

test('internal parent policy applies to imports, mutations, prompts and legacy documents without erasure',()=>{
 for(const component of ['tag-input','tag-more','dropdown-item','hint','field-label','items-list']){
 const original={...emptyDocument(),elements:[createElement(component)]},raw=JSON.stringify(original);
 assert.equal(validateScreen(original,{mode:'compatible'}).valid,false);
 for(const boundary of [()=>parseDocument(raw),()=>importEditorDocument(raw),()=>acceptEditorDocument(original),()=>generatePrompt(original),()=>generateRendererPrompt(original)])assert.throws(boundary,/INTERNAL_COMPONENT/);
 assert.equal(JSON.stringify(original),raw);
 const v2={schemaVersion:2,platform:'web',elements:original.elements,themeOverrides:{}};
 assert.throws(()=>parseDocument(JSON.stringify(v2)),/INTERNAL_COMPONENT/);
 }
 const nested={...emptyDocument(),elements:[{...createElement('dropdown-menu'),slots:{items:[{...createElement('items-list'),variantProps:{size:'m',amount:'x1'},slots:{items:[createElement('dropdown-item')]}}]}}]};
 assert.equal(validateScreen(nested).valid,true);
 for(const component of ['tag-input','tag-more','dropdown-item'])assert.equal(validateScreen({...emptyDocument(),elements:[{...createElement('input'),slots:{hint:[createElement(component)]}}]}).valid,false);
});
test('Select interaction state is optional, typed, belongs only to Select, and round-trips',()=>{
 const doc:any=structuredClone(fixture);doc.elements[1].interactionState={selectedValue:'Beta'};
 assert.deepEqual(importEditorDocument(JSON.stringify(doc)).document,doc);
 assert.deepEqual(strictDocument(doc),doc);assert.match(generatePrompt(doc),/selectedValue/);
 for(const state of [{selectedValue:'unknown'},{selectedValue:4},{selectedValue:'Beta',css:'red'},{}]){
 doc.elements[1].interactionState=state;assert.equal(validateScreen(doc).valid,false);
 }
 doc.elements[1].interactionState={selectedValue:null};assert.equal(validateScreen(doc).valid,true);
 doc.elements[0].interactionState={selectedValue:null};assert.equal(validateScreen(doc).valid,false);
});
test('rejected legacy roots remain byte-for-byte recoverable and cannot be autosaved',()=>{
 const bad={...emptyDocument(),elements:[createElement('tag-more')]},raw=JSON.stringify(bad);
 const values=new Map([['legacy',raw]]),prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
 try{const result=loadDocument('legacy');assert.match(result.error!,/INTERNAL_COMPONENT/);assert.equal(result.recoveryRaw,raw);assert.equal(values.get('legacy'),raw);assert.throws(()=>saveDocument(bad,'legacy'));assert.equal(values.get('legacy'),raw);}finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else Reflect.deleteProperty(globalThis,'localStorage');}
});
