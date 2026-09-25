import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {moneyReport} from '../lib/money-report.mjs';
test('report returns results and records the manifest that was shown',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-mr-'));
 try{const job={id:'run1',scrape:{finishedAt:'2026-09-25T00:00:00Z'},posts:[{id:'a',publishedAt:'2026-09-01T00:00:00Z',plays:1000,comments:2,caption:'Comment "YES"'}]};
  const r=await moneyReport(job,undefined,root);assert.equal(r.manifest.formula,'money-1.0');assert.deepEqual(r.versions,['money-1.0']);assert.equal(r.results.a.keyword,'YES');
  const saved=JSON.parse(await readFile(join(root,'scores','run1.json'),'utf8'));assert.equal(saved.manifest.inputHash,r.manifest.inputHash);assert.ok(Date.parse(saved.shownAt));
  await assert.rejects(moneyReport(job,'money-0.1',root),/Unknown money formula/);
 }finally{await rm(root,{recursive:true,force:true});}
});
