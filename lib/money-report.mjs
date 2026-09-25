// Money report for one run: computed on request from saved data; records which formula version was shown.
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {score,VERSIONS,LATEST} from '../public/money/index.mjs';
import {atomic} from './pipeline.mjs';
export async function moneyReport(job,version,root){
 const report=score(job,version||LATEST);
 await mkdir(join(root,'scores'),{recursive:true});
 await atomic(join(root,'scores',job.id+'.json'),{shownAt:new Date().toISOString(),manifest:report.manifest});
 return {...report,versions:Object.keys(VERSIONS)};
}
