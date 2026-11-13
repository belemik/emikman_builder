import {test} from 'node:test';import assert from 'node:assert/strict';
import {FixturePages,type FixtureRow} from './fixtures/hardening-contracts';
const scope={account:'A',collection:'projects',epoch:1,includeDeleted:false};
const rows:FixtureRow[]=Array.from({length:7},(_,i)=>({id:String(i+1).padStart(3,'0'),account:'A',name:'Synthetic',deleted:false}));
test('H3 cursor empty, first, middle, last: stable order and no silent truncation',()=>{
 const p=new FixturePages(100);assert.deepEqual(p.page([],scope,2,0).items,[]);
 let cursor:string|null=null;const ids:string[]=[];
 do{const r=p.page([...rows].reverse(),scope,2,0,cursor);ids.push(...r.items.map(x=>x.id));cursor=r.nextCursor;}while(cursor);
 assert.deepEqual(ids,rows.map(x=>x.id));
});
test('H3 opaque cursor rejects forged, foreign account/collection, expiry, changed limit/epoch',()=>{
 const p=new FixturePages(100),c=p.page(rows,scope,2,0).nextCursor;assert.ok(c);
 for(const s of [{...scope,account:'B'},{...scope,collection:'history:001'},{...scope,epoch:2},{...scope,includeDeleted:true}])assert.throws(()=>p.page(rows,s,2,1,c),/TEST_CURSOR/);
 assert.throws(()=>p.page(rows,scope,2,100,c),/TEST_CURSOR/);assert.throws(()=>p.page(rows,scope,3,1,c),/TEST_CURSOR/);assert.throws(()=>p.page(rows,scope,2,1,'forged'),/TEST_CURSOR/);
});
test('H3 concurrent insert/delete invalidate epoch; new snapshot and tombstone visibility explicit',()=>{
 const p=new FixturePages(100),c=p.page(rows,scope,2,0).nextCursor;
 const changed=rows.filter(r=>r.id!=='003').concat({id:'008',account:'A',name:'Inserted',deleted:false});
 assert.throws(()=>p.page(changed,{...scope,epoch:2},2,1,c),/TEST_CURSOR/);
 const deleted=rows.map(r=>({...r,deleted:r.id==='001'}));assert.deepEqual(p.page(deleted,scope,4,0).items.map(r=>r.id),['002','003','004','005']);
 assert.deepEqual(p.page(deleted,{...scope,includeDeleted:true},4,0).items.map(r=>r.id),['001','002','003','004']);
});
test('H3 fixture allocation and page boundaries L-1/L/L+1 and cursor saturation',()=>{
 const p=new FixturePages(100);for(const n of [3,4])assert.equal(p.page(rows,scope,n,0).items.length,n);
 assert.throws(()=>p.page(rows,scope,5,0),/BUDGET/);assert.throws(()=>p.page(rows,scope,0,0),/BUDGET/);
 assert.throws(()=>p.page([...rows,...rows],scope,2,0),/DUPLICATE_ID/);
 assert.throws(()=>p.page([{...rows[0],name:'x'.repeat(129)}],scope,2,0),/ROW_BUDGET/);
 for(let i=0;i<62;i++)p.page(rows,scope,1,0);assert.throws(()=>p.page(rows,scope,1,0),/CAPACITY/);
 // Expired tokens release bounded registry capacity.
 assert.ok(p.page(rows,scope,1,100).nextCursor);
});
