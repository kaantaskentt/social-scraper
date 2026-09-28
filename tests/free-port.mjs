// A port the operating system says is free right now (server tests guessed from one range and collided, 2026-09-29).
import {createServer} from 'node:net';
export const freePort=()=>new Promise((ok,fail)=>{const s=createServer();s.on('error',fail);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>ok(port));});});
