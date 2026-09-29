// The error log, for the hourly fixer and for people (Kaan, 2026-09-29).
//   node scripts/errors.mjs open               the open errors, grouped, most frequent first (free, reads data/ only)
//   node scripts/errors.mjs fixed <id> <note>  mark one fixed (note: the commit and what changed)
//   node scripts/errors.mjs notbug <id> <note> mark one as not a bug (note: why, and what Kaan must do if anything)
import {ErrorLog} from '../lib/errors.mjs';
const log=new ErrorLog(new URL('../data/',import.meta.url).pathname),[cmd,id,...rest]=process.argv.slice(2);
if(cmd==='open'||!cmd){
 const open=await log.open();if(!open.length){console.log('No open errors.');process.exit(0);}
 for(const g of open)console.log(`\n[${g.id}] ${g.count}x · ${g.source} · ${g.where||'-'} · first ${g.first} · last ${g.last}${g.accounts.length?` · @${g.accounts.join(' @')}`:''}${g.runIds.length?` · runs ${g.runIds.join(' ')}`:''}\n  ${g.message}${g.detail?`\n  detail: ${g.detail.split('\n').slice(0,6).join(' | ')}`:''}${g.before?`\n  seen again after it was marked ${g.before.status} (${g.before.at}): ${g.before.note}`:''}`);
}else if(cmd==='fixed'||cmd==='notbug'){
 if(!id||!rest.length)throw new Error(`Usage: node scripts/errors.mjs ${cmd} <id> <note>`);
 const r=await log.mark(id,{status:cmd==='fixed'?'fixed':'not a bug',note:rest.join(' ')});console.log(`${id}: ${r.status} (${r.note})`);
}else throw new Error('Commands: open, fixed <id> <note>, notbug <id> <note>');
