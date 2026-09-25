// Script parts in the reel panel: which part is playing, which labels are shaky, and the clickable parts.
// Pure, so Node tests can import it. Uncertain = Jev confidence below 0.65: a blind check (docs/evals/2026-09-26-anatomy-check.md)
// found 95% agreement above that line and about 50% below it.
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const UNSURE=0.65;
export const isUncertain=part=>Number.isFinite(part?.confidence)&&part.confidence<UNSURE;
const timed=part=>part?.start!=null&&part?.end!=null&&Number.isFinite(+part.start)&&Number.isFinite(+part.end);

// Index of the part playing at `seconds`: [start, end), so an exact boundary belongs to the later part; gaps give -1.
export function segmentAt(anatomy,seconds){
 if(!Number.isFinite(seconds))return -1;let found=-1;
 anatomy.forEach((part,i)=>{if(timed(part)&&seconds>=+part.start&&seconds<+part.end)found=i;});
 return found;
}

const sureness=part=>`Jev is ${Math.round(part.confidence*100)}% sure`;
export function partRow(part,i,{role,color}){
 const unsure=isUncertain(part), label=timed(part)?`Play from ${Number(part.start).toFixed(1)} seconds: ${role}`:`No timing for this part: ${role}`;
 return `<button type="button" class="segment${unsure?' uncertain':''}" data-segment="${i}" id="segment-${i}" style="--color:${escape(color)}" aria-label="${escape(label+(unsure?`, ${sureness(part)}`:''))}"${unsure?` title="${escape(sureness(part))}"`:''}><small>${timed(part)?`${Number(part.start).toFixed(1)}s · `:''}${escape(role)}${unsure?' ?':''}</small><span>${escape(part.text)}</span></button>`;
}
export function barPart(part,i,{role,color}){
 return `<button type="button"${isUncertain(part)?' class="uncertain"':''} data-segment="${i}" title="${escape(`${role}: ${part.text}`)}" aria-label="Go to part ${i+1}: ${escape(role)}" style="flex:${Math.max(1,String(part.text||'').length)};--color:${escape(color)}"></button>`;
}
