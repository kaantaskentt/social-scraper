import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ErrorLog,errorId} from '../lib/errors.mjs';

test('the same error groups under one id: numbers, prices and ids masked; other places stay apart',()=>{
 const a=errorId({source:'server',where:'look',message:'The next picture would pass the limit of $1.98'});
 assert.equal(a,errorId({source:'server',where:'look',message:'The next picture would pass the limit of $2.50'}));
 assert.equal(errorId({source:'server',message:'making the reel for 5c09a3fe-ddc2-4951-9e46-1ef228cf59bd stopped'}),errorId({source:'server',message:'making the reel for 8952d5c8-9b67-4b81-afd8-5c3308ac4e6f stopped'}));
 assert.notEqual(a,errorId({source:'page',where:'look',message:'The next picture would pass the limit of $1.98'}));
});
test('errors are logged, repeats within a minute written once, open ones grouped; a fixed error that returns is open again',async()=>{
 const root=await mkdtemp(join(tmpdir(),'errs-'));const log=new ErrorLog(root);
 try{
  const t=m=>new Date(Date.parse('2026-09-29T10:00:00Z')+m*60000).toISOString();
  const id=await log.add({source:'server',where:'look',message:'The kit did not fit the format twice',runId:'r1',account:'liangsvitality',at:t(0)});
  await log.add({source:'server',where:'look',message:'The kit did not fit the format twice',runId:'r1',at:t(0.5)}); // same minute: once
  await log.add({source:'server',where:'look',message:'The kit did not fit the format twice',runId:'r2',at:t(3)});
  await log.add({source:'page',where:'copy',message:'Cannot read properties of undefined',at:t(4)});
  let open=await log.open();assert.deepEqual(open.map(g=>[g.where,g.count]),[['look',2],['copy',1]]);assert.deepEqual(open[0].runIds,['r1','r2']);assert.deepEqual(open[0].accounts,['liangsvitality']);
  await log.mark(id,{status:'fixed',note:'ceeaf2e: colours'});open=await log.open();assert.deepEqual(open.map(g=>g.where),['copy']);
  await log.add({source:'server',where:'look',message:'The kit did not fit the format twice',at:new Date(Date.now()+60000).toISOString()});
  open=await log.open();assert.equal(open.find(g=>g.id===id).before.status,'fixed'); // it came back: open again, with the earlier fix noted
  await assert.rejects(log.mark(id,{status:'maybe'}),/fixed or not a bug/);
 }finally{await rm(root,{recursive:true,force:true});}
});
