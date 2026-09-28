// Re-edits a finished reel from footage we already paid for (free: ffmpeg, Remotion, a Groq transcript):
// node scripts/re-edit.mjs <runId> <reelId> <source.mp4> <keep: 0-2.6,4.3-13.35> [--captions] [--no-hook]
// Keeps the listed stretches of the source, adds the hook and the end card, captions only with --captions (a source
// that already has burned-in captions must not get a second set). The old reel stays as reel-before-<time>.mp4.
// Then it checks every kept sentence is heard in full and updates reel.json.
import {readFile,writeFile,copyFile,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseEnv,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {renderReel,mediaSeconds} from '../lib/render-reel.mjs';
import {transcribeWords} from '../lib/captions.mjs';

const exec=promisify(execFile);
const env=parseEnv(await readFile(new URL('../../office/.env.local',import.meta.url),'utf8'));
const [runId,reelId,source,keepArg,...flags]=process.argv.slice(2);const captions=flags.includes('--captions'),noHook=flags.includes('--no-hook');
const ch=new URL(`../data/channels/${runId}/`,import.meta.url).pathname,dir=join(ch,'reels',reelId);
const reel=JSON.parse(await readFile(join(dir,'reel.json'),'utf8'));
const kit=JSON.parse(await readFile(join(ch,'kit','kit.json'),'utf8').catch(()=>'null'));
const keep=keepArg.split(',').map(s=>s.split('-').map(Number));
const tmp=await mkdtemp(join(tmpdir(),'re-edit-'));
// 1. Cut and join the kept stretches (re-encoded, so every cut is frame-exact).
const filter=keep.map(([a,b],i)=>`[0:v]trim=${a}:${b},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=${a}:${b},asetpts=PTS-STARTPTS[a${i}];`).join('')+keep.map((_,i)=>`[v${i}][a${i}]`).join('')+`concat=n=${keep.length}:v=1:a=1[v][a]`;
const cut=join(tmp,'cut.mp4');await exec('ffmpeg',['-v','error','-y','-i',source,'-filter_complex',filter,'-map','[v]','-map','[a]','-c:v','libx264','-preset','veryfast','-c:a','aac',cut]);
// 2. What is said in the kept footage, for captions and the hearing check.
const audio=join(tmp,'cut.mp3');await exec('ffmpeg',['-v','error','-y','-i',cut,'-vn','-ac','1','-ar','16000',audio]);
const words=await transcribeWords(audio,env.GROQ_API_KEY),said=words.map(w=>w.text).join(' ');
// 3. The reel: kept footage, its own sound, the hook, the end card.
const before=join(dir,`reel-before-${Date.now()}.mp4`);await copyFile(join(dir,'reel.mp4'),before);
const out=join(dir,'reel.mp4');
const r=await renderReel({clips:[cut],voice:cut,words:captions?words:[],groqKey:env.GROQ_API_KEY,hook:reel.hook&&!noHook?{text:reel.hook,until:2.2}:null,endCard:{title:kit?.kit?.name||reel.title,subtitle:'Follow for the next one'},out});
// 4. Every sentence must end before the end card: the sound is quiet in the last 0.15 s of the kept footage. Measured,
// because transcript word times are rough (celery's last word ended at 22.28 s in one transcript, 22.82 s in another).
const content=await mediaSeconds(cut);
const {stderr}=await exec('ffmpeg',['-hide_banner','-ss',String(Math.max(0,content-0.15)),'-i',cut,'-af','astats=metadata=1,ametadata=print:key=lavfi.astats.Overall.RMS_level','-f','null','-']);
const level=Number(([...stderr.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].at(-1)?.[1]??'0').replace('-inf','-200'));
const heard={all:level<-38, // speech measured -24 to -30 dB, a fading word -41, silence below -70 (celery, 2026-09-28)
 tailDb:Math.round(level),lastWords:words.slice(-5).map(w=>w.text).join(' '),checkedAt:new Date().toISOString()};
Object.assign(reel,{seconds:r.seconds,heard:{...heard,missing:heard.all?[]:[heard.lastWords]},reEdited:{from:source,keep,before,at:new Date().toISOString()}});
await writeFile(join(dir,'reel.json'),JSON.stringify(reel,null,1));
console.log(`${reelId}: ${r.seconds.toFixed(1)} s (content ${content.toFixed(1)} s). Said: "${said}"\nEnds cleanly: ${heard.all?'yes':'NO'} (sound ${heard.tailDb} dB just before the cut; "${heard.lastWords}"). Old reel kept as ${before}`);
