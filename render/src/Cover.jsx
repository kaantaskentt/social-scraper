// The reel's cover picture: the strongest frame, darkened at the bottom, with the hook as a big title. The title sits
// in the middle band, so it survives Instagram's 3:4 crop in the profile grid.
import React from 'react';
import {AbsoluteFill,Img,staticFile} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Montserrat';
const {fontFamily}=loadFont('normal',{weights:['800'],subsets:['latin']});
export const Cover=({image,title})=>(
 <AbsoluteFill style={{background:'#000'}}>
  {image?<Img src={staticFile(image)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:null}
  <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.55) 100%)'}}/>
  <AbsoluteFill style={{justifyContent:'center',alignItems:'center',padding:'0 70px'}}>
   <div style={{marginTop:260,maxWidth:940,textAlign:'center',fontFamily,fontWeight:800,fontSize:104,lineHeight:1.02,color:'#fff',textTransform:'uppercase',textShadow:'0 6px 24px rgba(0,0,0,.6)'}}>{title}</div>
  </AbsoluteFill>
 </AbsoluteFill>
);
