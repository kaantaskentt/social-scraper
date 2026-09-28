// One job per channel at a time for the command-line scripts (two runs on one channel paid for a part twice and
// wrote ideas under a running batch, 2026-09-28). The lock names the process holding it; a dead holder is ignored.
import {readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
export function lockChannel(root,runId,what){
 const file=join(root,'channels',runId,'.busy');
 if(existsSync(file)){const held=JSON.parse(readFileSync(file,'utf8'));let alive=false;try{process.kill(held.pid,0);alive=true;}catch(e){alive=e.code==="EPERM";} // EPERM: alive, owned by someone else
  if(alive&&held.pid!==process.pid)throw new Error(`Channel busy: "${held.what}" is running (process ${held.pid}). Wait for it or stop it first.`);}
 writeFileSync(file,JSON.stringify({pid:process.pid,what,at:new Date().toISOString()}));
 const free=()=>{try{if(JSON.parse(readFileSync(file,'utf8')).pid===process.pid)rmSync(file);}catch{}};
 process.on('exit',free);for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>{free();process.exit(1);});
}
