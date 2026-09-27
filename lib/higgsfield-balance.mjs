// The Higgsfield credit balance, read from the signed-in CLI (free). Shown next to every price before spending.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export function parseBalance(text){const m=/([\d.,]+)\s+credits/i.exec(String(text));if(!m)throw new Error('Could not read the Higgsfield balance. Is the CLI signed in?');const n=Number(m[1].replace(/,/g,''));if(!Number.isFinite(n))throw new Error('Could not read the Higgsfield balance');return n;}
export async function higgsfieldBalance({run=async()=>(await exec('higgsfield',['account','status'],{timeout:30000})).stdout}={}){return {credits:parseBalance(await run())};}
