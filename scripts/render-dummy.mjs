// Proves the editing pipeline without buying footage: 3 placeholder clips, a placeholder voice (macOS `say`), real word
// timing from Groq, rendered with Remotion. Usage: node scripts/render-dummy.mjs <outdir>   (needs GROQ_API_KEY)
import {mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {renderReel} from '../lib/render-reel.mjs';
const exec=promisify(execFile);
const out=process.argv[2];if(!out)throw new Error('Usage: node scripts/render-dummy.mjs <outdir>');await mkdir(out,{recursive:true});
if(!process.env.GROQ_API_KEY)throw new Error('GROQ_API_KEY is not set');
const clips=[];
for(const [i,src] of ['testsrc2=size=1080x1920:rate=30:duration=4','color=c=0x2f4f9e:size=1080x1920:rate=30:duration=5','smptebars=size=1080x1920:rate=30:duration=4'].entries()){
 const f=join(out,`dummy-${i}.mp4`);await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i',src,'-pix_fmt','yuv420p',f]);clips.push(f);}
const voice=join(out,'voice.aiff');
await exec('say',['-o',voice,'Drop an egg into a glass of water. If it sinks, it is fresh. If it floats, throw it away. Comment EGG for the full guide.']);
const r=await renderReel({clips,voice,groqKey:process.env.GROQ_API_KEY,hook:{text:'Is your egg still fresh?',until:2.2},endCard:{title:'Comment EGG',subtitle:'for the full guide'},out:join(out,'dummy-reel.mp4')});
console.log(JSON.stringify({...r,words:r.words.length}));
