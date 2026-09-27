// Your lines for each reel's shot list, on the page side. What you typed this session is the truth: a slower server
// answer never replaces it, and saves for one reel are sent one after another so the newest text always lands last.
export function createLineStore({post}){
 const typed=new Map(),chains=new Map();
 return {
  edit(key,lines){typed.set(key,[...lines]);},
  merge(key,fromServer){const mine=typed.get(key);return mine?fromServer.map((_,i)=>mine[i]??''):fromServer;},
  save(key,{keepalive=false}={}){const lines=[...(typed.get(key)||[])];
   const next=(chains.get(key)||Promise.resolve()).catch(()=>{}).then(()=>post(key,lines,{keepalive}));chains.set(key,next);return next;}
 };
}
