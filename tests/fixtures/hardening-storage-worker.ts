import { DatabaseSync } from 'node:sqlite';
const [path,mode]=process.argv.slice(2);
if(!path||!['busy','crash'].includes(mode))throw Error('EXPLICIT_FIXTURE_REQUIRED');
const db=new DatabaseSync(path);db.exec('PRAGMA busy_timeout=60; PRAGMA synchronous=FULL;');
if(mode==='crash') {
  db.exec("BEGIN IMMEDIATE; INSERT INTO probe VALUES('uncommitted');");
  process.send?.({kind:'transaction-open'}); // trusted parent kills this child; no user callback.
  setInterval(()=>{},1000);
}else {
  try {db.exec("BEGIN IMMEDIATE; INSERT INTO probe VALUES('child'); COMMIT;");process.send?.({kind:'committed'});}
  catch(error){process.send?.({kind:'refused',code:error instanceof Error&&'errcode'in error?error.errcode:null});}
  finally{db.close();process.disconnect?.();}
}
