// Real production HTTP pairing test; no model inference or desktop actions.
import {get} from 'node:http';
import {spawn} from 'node:child_process';import {promises as fs} from 'node:fs';import {once} from 'node:events';import path from 'node:path';import assert from 'node:assert/strict';
const base='http://127.0.0.1:3140',local='http://127.0.0.1:3141';const state=path.resolve('work/pairing-smoke/devices.json');await fs.mkdir('work/pairing-smoke',{recursive:true});await fs.rm(state,{force:true});
let child:ReturnType<typeof spawn>|undefined;
async function start(){child=spawn(process.execPath,['--import','tsx','companion/server.ts'],{env:{...process.env,NODE_ENV:'production',PORT:'3140',MAC_PANEL_PORT:'3141',APP_ORIGIN:base,TEST_FOLDER:path.resolve('work/pairing-smoke'),MONGODB_DATABASE:'remote_mac_pairing_smoke',PAIRING_STATE_FILE:state},stdio:'ignore',detached:true});for(let n=0;n<100;n++){if(child.exitCode!==null)throw new Error('Companion failed to start');try{if((await fetch(local+'/status')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Startup timeout');}
async function stop(){if(child?.pid){const exited=once(child,'exit');process.kill(-child.pid,'SIGTERM');await exited;child=undefined;}}
try{
 await start();const panel=await (await fetch(local+'/status')).json();assert.match(panel.code,/^\d{6}$/);
 assert.equal((await fetch(base+'/api/status')).status,401);
 const paired=await fetch(base+'/api/pair',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({code:panel.code,deviceName:'Smoke phone'})});assert.equal(paired.status,200);const cookie=paired.headers.get('set-cookie')!.split(';')[0];assert.match(paired.headers.get('set-cookie')!,/HttpOnly/);
 assert.equal((await fetch(base+'/api/status',{headers:{cookie}})).status,200);const newChat=await (await fetch(base+'/api/chats',{method:'POST',headers:{cookie,origin:base}})).json();await stop();await start();assert.equal((await fetch(base+'/api/chat?id='+newChat.id,{headers:{cookie}})).status,200,'chat survives restart');assert.equal((await fetch(base+'/api/chat?id='+newChat.id)).status,401);
 assert.equal((await fetch(base+'/api/status',{headers:{cookie}})).status,200,'same phone must stay paired after restart');
 assert.equal((await fetch(local+'/new-code',{method:'POST',headers:{origin:'https://evil.example'}})).status,403);
 const badHost=await new Promise<number|undefined>((resolve,reject)=>{get(local+'/status',{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(badHost,403);
 assert.equal((await fetch(base+'/api/new-code',{method:'POST',headers:{cookie,origin:base}})).status,404);
 assert.equal((await fetch(local+'/revoke',{method:'POST',headers:{origin:local}})).status,200);
 assert.equal((await fetch(base+'/api/status',{headers:{cookie}})).status,401);await stop();await start();assert.equal((await fetch(base+'/api/status',{headers:{cookie}})).status,401);
 console.log('REAL HTTP PAIRING PASSED: pair once, restart, revoke, Origin/Host protection, no phone admin route.');
}finally{await stop();await fs.rm(state,{force:true});}
