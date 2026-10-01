import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
let config={};try{config=parseEnv(await readFile(new URL('../.env',import.meta.url),'utf8'));}catch{}
const value=name=>config[name]||process.env[name];
let failures=0;
function check(name,ok,hint){console.log(`${ok?'OK':'MISSING'} ${name}${ok?'':`: ${hint}`}`);if(!ok)failures++;}
const [major,minor]=process.versions.node.split('.').map(Number);
check('Node.js',major>22||major===22&&minor>=9,'Install Node 24 LTS or Node >=22.9.');
for(const cmd of ['ffmpeg','ffprobe'])check(cmd,spawnSync(cmd,['-version'],{stdio:'ignore'}).status===0,'Install FFmpeg, then reopen your terminal.');
const provider=value('TRANSCRIPTION_PROVIDER')||'fireworks';
check('Transcription provider',['fireworks','groq'].includes(provider),'Set TRANSCRIPTION_PROVIDER to fireworks or groq.');
check('Apify key',Boolean(value('APIFY_TOKEN')||value('APIFY_API_TOKEN')),'Add APIFY_TOKEN to .env.');
check('Jev key',Boolean(value('TYPESAFE_API_KEY')||value('JEV_API_KEY')),'Add TYPESAFE_API_KEY to .env.');
if(['fireworks','groq'].includes(provider))check(`${provider} key`,Boolean(value(provider==='groq'?'GROQ_API_KEY':'FIREWORKS_API_KEY')),`Add your ${provider} key to .env.`);
check('Gemini key',Boolean(value('GEMINI_API_KEY')),'Add GEMINI_API_KEY to .env (Why do these win?, the Look and Copy need it).');
check('Video editor',existsSync(new URL('../render/node_modules/',import.meta.url)),'Run: cd render && npm ci');
console.log('Keys are checked for presence only. No key values are printed and no paid requests are made.');
console.log(failures?'Fix the items above for live analysis. The synthetic demo still works without keys.':'Ready. Run npm start and open http://127.0.0.1:5190.');
process.exitCode=failures?1:0;
