// Screenshots of every step of the flow, for the design audit (read only: no clicks that spend).
import {chromium} from '/Users/kaantaskent/Dev/active/JEV/voice-control/node_modules/playwright-core/index.mjs';
const out=process.argv[2]||'/private/tmp/claude-501/-Users-kaantaskent-Dev-active-JEV/2620578c-9ec6-4135-a7e5-3729bcdef60a/scratchpad/shots';
const runs=(process.argv[3]||'5c09a3fe-ddc2-4951-9e46-1ef228cf59bd:liang,a444f915-b549-4b73-bbde-664c3aea9216:ken').split(',').map(s=>s.split(':'));
const steps=(process.argv[4]||'scan,winners,secret,kit,make,ready').split(',');
const width=Number(process.argv[5]||1440);
const browser=await chromium.launch({executablePath:`${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium`}).catch(()=>chromium.launch());
const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(process.env.BASE||'http://localhost:5191/');
for(const [id,name] of runs)for(const step of steps){
 await page.evaluate(([id,step])=>{localStorage.setItem('flow.run',id);localStorage.setItem(`flow.step.${id}`,step);},[id,step]);
 await page.reload({waitUntil:'networkidle'});await page.waitForTimeout(1500);
 const shown=await page.evaluate(()=>document.querySelector('[aria-current="step"],.step.is-current,.stepper .current')?.textContent?.trim()||'');
 await page.screenshot({path:`${out}/${name}-${step}.png`,fullPage:true});console.log(name,step,'->',shown);
}
console.log('errors',[...new Set(errors)]);await browser.close();
