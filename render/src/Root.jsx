import React from 'react';
import {Composition,Still} from 'remotion';
import {Reel} from './Reel.jsx';
import {Cover} from './Cover.jsx';
const FPS=30;
export const Root=()=>(<>
 <Composition id="Reel" component={Reel} fps={FPS} width={1080} height={1920} durationInFrames={FPS*10}
  defaultProps={{clips:[],voice:null,music:null,captions:[],hook:null,endCard:null,totalSeconds:10}}
  calculateMetadata={({props})=>({durationInFrames:Math.max(1,Math.round(props.totalSeconds*FPS))})}/>
 <Still id="Cover" component={Cover} width={1080} height={1920} defaultProps={{image:null,title:''}}/>
</>);
