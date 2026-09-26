import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReplicatePanel} from '../public/replicate-view.mjs';
const base={runId:'run1',post:{id:'reel1',videoUrl:'https://cdn/x.mp4'},savedVideo:true,refs:[],open:false,overlayText:'',keepSound:true,estimate:null,busy:'',error:'',replicas:[]};

test('closed: one simple button, no form',()=>{
 const html=renderReplicatePanel(base);
 assert.match(html,/data-replicate="open"[^>]*>Replicate this reel/);assert.doesNotMatch(html,/data-replicate="estimate"/);
});
test('open without references: asks for references and cannot check the cost yet',()=>{
 const html=renderReplicatePanel({...base,open:true});
 assert.match(html,/Add your product images/);assert.match(html,/type="file"[^>]*accept="image\/png,image\/jpeg,image\/webp"[^>]*multiple/);
 assert.match(html,/data-replicate="estimate"[^>]*disabled/);assert.match(html,/Keep the original sound/);assert.match(html,/checked/);
});
test('open with references: thumbnails with remove, cost check enabled; with an estimate: confirm button shows credits',()=>{
 const refs=[{id:'a',url:'/references/a'},{id:'b',url:'/references/b'}];
 const html=renderReplicatePanel({...base,open:true,refs});
 assert.equal((html.match(/data-remove-ref=/g)||[]).length,2);assert.match(html,/src="\/references\/a"/);assert.doesNotMatch(html,/data-replicate="estimate"[^>]*disabled/);
 const est=renderReplicatePanel({...base,open:true,refs,estimate:{credits:84,seconds:12}});
 assert.match(est,/data-replicate="start"[^>]*>Replicate for 84 credits/);assert.match(est,/12 s video/);
});
test('replicas: progress, failure reasons, and a side-by-side when done',()=>{
 const html=renderReplicatePanel({...base,replicas:[
  {id:'1',status:'generating',credits:84},{id:'2',status:'uncertain',error:'may have gone through'},
  {id:'3',status:'done',video:'/replicas/3.mp4',credits:84}]});
 assert.match(html,/Generating/);assert.match(html,/may have gone through/);
 assert.match(html,/<video[^>]*src="\/videos\/run1\/reel1"/);assert.match(html,/<video[^>]*src="\/replicas\/3.mp4"/);assert.match(html,/download/);
 const remote=renderReplicatePanel({...base,savedVideo:false,replicas:[{id:'3',status:'done',video:'/replicas/3.mp4'}]});
 assert.match(remote,/src="https:\/\/cdn\/x.mp4"/);
});
test('busy and error states, and everything from data is escaped',()=>{
 assert.match(renderReplicatePanel({...base,open:true,busy:'Checking cost…'}),/Checking cost…/);
 const evil='<script>x</script>';const html=renderReplicatePanel({...base,open:true,overlayText:evil,error:evil,replicas:[{id:'9',status:'failed',error:evil}]});
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
