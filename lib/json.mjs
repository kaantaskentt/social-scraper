// Reading and writing the app's JSON files, in one place (the same two helpers were copied into ten modules; audit
// 2026-09-29). A missing or unreadable file reads as null; a write goes to a temporary file and is renamed over the old
// one, so a reader never sees half a file.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}
export async function writeJson(file,value){const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,1));await rename(temp,file);}
