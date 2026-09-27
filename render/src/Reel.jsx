// A finished 9:16 reel: clips back to back, the voiceover, music ducked under it, word-timed captions with the spoken
// word highlighted, an optional hook title in the first seconds, and an end card with the call to action.
import React from 'react';
import {AbsoluteFill,Sequence,OffthreadVideo,Audio,staticFile,useCurrentFrame,useVideoConfig,interpolate} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Montserrat';
const {fontFamily}=loadFont('normal',{weights:['800'],subsets:['latin']});
const s=(fps,t)=>Math.round(t*fps);

function Captions({captions}){
 const frame=useCurrentFrame(),{fps}=useVideoConfig(),t=frame/fps;
 const chunk=captions.find(c=>t>=c.start&&t<c.end);if(!chunk)return null;
 return <AbsoluteFill style={{justifyContent:'flex-end',alignItems:'center',paddingBottom:560}}>
  <div style={{maxWidth:900,textAlign:'center',fontFamily,fontWeight:800,fontSize:78,lineHeight:1.12,color:'#fff',textTransform:'uppercase',
   textShadow:'0 4px 0 rgba(0,0,0,.55), 0 0 18px rgba(0,0,0,.45)',WebkitTextStroke:'2px rgba(0,0,0,.6)'}}>
   {chunk.words.map((w,i)=><span key={i} style={{color:t>=w.start&&t<w.end+0.05?'#FFE14D':'#fff'}}>{w.text}{i<chunk.words.length-1?' ':''}</span>)}
  </div></AbsoluteFill>;
}
function Hook({text}){
 const frame=useCurrentFrame(),{fps}=useVideoConfig();const pop=interpolate(frame,[0,s(fps,0.25)],[0.85,1],{extrapolateRight:'clamp'});
 return <AbsoluteFill style={{justifyContent:'flex-start',alignItems:'center',paddingTop:260}}>
  <div style={{transform:`scale(${pop})`,maxWidth:920,textAlign:'center',fontFamily,fontWeight:800,fontSize:66,lineHeight:1.1,color:'#111',background:'#fff',padding:'18px 28px',borderRadius:22,boxShadow:'0 10px 30px rgba(0,0,0,.25)'}}>{text}</div>
 </AbsoluteFill>;
}
function EndCard({title,subtitle}){
 const frame=useCurrentFrame(),{fps}=useVideoConfig();const opacity=interpolate(frame,[0,s(fps,0.3)],[0,1],{extrapolateRight:'clamp'});
 return <AbsoluteFill style={{opacity,justifyContent:'center',alignItems:'center',background:'rgba(10,10,10,.55)'}}>
  <div style={{textAlign:'center',fontFamily,color:'#fff'}}><div style={{fontWeight:800,fontSize:96,lineHeight:1.05}}>{title}</div>
   {subtitle?<div style={{marginTop:22,fontWeight:800,fontSize:48,opacity:.9}}>{subtitle}</div>:null}</div></AbsoluteFill>;
}
export const Reel=({clips,voice,music,captions,hook,endCard})=>{
 const {fps}=useVideoConfig();
 return <AbsoluteFill style={{background:'#000'}}>
  {clips.map((c,i)=><Sequence key={i} from={s(fps,c.start)} durationInFrames={Math.max(1,s(fps,c.duration))}>
   <OffthreadVideo src={staticFile(c.src)} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/></Sequence>)}
  {voice?<Audio src={staticFile(voice.src)} volume={1}/>:null}
  {music?<Audio src={staticFile(music.src)} volume={music.volume??0.12}/>:null}
  {hook?<Sequence from={0} durationInFrames={s(fps,hook.until)}><Hook text={hook.text}/></Sequence>:null}
  <Captions captions={captions}/>
  {endCard?<Sequence from={s(fps,endCard.start)} durationInFrames={s(fps,endCard.duration)}><EndCard title={endCard.title} subtitle={endCard.subtitle}/></Sequence>:null}
 </AbsoluteFill>;
};
