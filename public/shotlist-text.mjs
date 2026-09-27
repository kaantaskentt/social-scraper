// Shared by the server and the page: the tip for each script role, and the shot list as plain text to paste into Notes.
export const TIPS={
 hook:'First 2 seconds. Say the most surprising line first, no intro.',
 setup:'One sentence of context, then move on.',
 problem:'Name the pain your buyer feels, in their words.',
 example:'Show a real case: a client, a number, a screen.',
 advice:'Give the one thing to do. Show it if you can.',
 payoff:'Answer the question from the hook.',
 cta:'Ask for one action only.',
 other:'Keep it short or cut it.',
 unclear:'Keep it short or cut it.',
 visual:'No talking here. Copy the shot: framing, movement, what is in view.'
};
export const span=p=>`${Math.round(p.start)}–${Math.max(Math.round(p.end),Math.round(p.start)+1)} s`;
export function shotListText(list,lines=[]){
 const head=[`Shot list: @${list.account}`,list.url,`${Math.round(list.duration)} s · ${list.pace.shots} shots · a new shot every ${list.pace.secondsPerShot} s`,''];
 const body=list.parts.flatMap((p,i)=>[`${i+1}. ${p.role.toUpperCase()} · ${span(p)}`,...(p.said?[`They said: ${p.said}`]:[]),`Tip: ${TIPS[p.role]||TIPS.other}`,`Your line: ${lines[i]?.trim()||'___'}`,'']);
 return [...head,...body].join('\n').trim()+'\n';
}
