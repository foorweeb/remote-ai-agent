import next from 'next';
import {configuredRemoteOrigin,allowedOrigins} from './remote-config.js';
import { createServer } from 'node:http';
import { ChatDatabase } from './database.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { plan } from './codex.js';
import { runAgent, type Prompt } from './agent.js';
import { randomUUID } from 'node:crypto';
const mode=process.env.REMOTE_MODE==='files'?'files':'computer';
import { PairingStore, COOKIE_SECONDS } from './pairing.js';
import { startMacPanel } from './mac-panel.js';
import { FileAdapter } from './files.js';
const folder=process.env.TEST_FOLDER;if(!folder)throw new Error('Set TEST_FOLDER to the folder you want to control.');
const root=await fs.realpath(folder);if(!(await fs.stat(root)).isDirectory())throw new Error('TEST_FOLDER must be a directory');
const host=process.env.HOST||'127.0.0.1', port=Number(process.env.PORT||3000);
const localOrigin=`http://127.0.0.1:${port}`;
const origin=configuredRemoteOrigin()||`http://${host}:${port}`;const trustedOrigins=allowedOrigins(origin,localOrigin);
if(host!=='127.0.0.1'&&!origin.startsWith('https://'))throw new Error('Remote access requires APP_ORIGIN=https://… through a private TLS proxy.');
const app=next({dev:process.env.NODE_ENV!=='production',hostname:host,port});await app.prepare();
const handler=app.getRequestHandler(),adapter=new FileAdapter(root);
const pairing=new PairingStore(path.resolve(process.env.PAIRING_STATE_FILE||'.remote-mac/paired-devices.json'));await pairing.load();
const cookie=(token:string,secure=origin.startsWith('https:'))=>`remote_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_SECONDS}${secure?'; Secure':''}`;
const database=new ChatDatabase();await database.connect();await database.recover();
type Job={id:string,chatId:string,status:string,events:string[],controller:AbortController,prompts:Prompt[],replies:Map<string,(answers:Record<string,string>)=>void>};let job:Job|undefined;let taskReserved=false;database.onFailure=()=>job?.controller.abort();
createServer(async(req,res)=>{try{
 const url=new URL(req.url||'/',origin);if(!url.pathname.startsWith('/api/')){await handler(req,res);return;}
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const reply=(status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(req.method==='POST'&&!trustedOrigins.has(req.headers.origin||'')){reply(403,{error:'Origin rejected'});return;}
 const body=async()=>{let s='';for await(const chunk of req){s+=chunk;if(s.length>4096)throw new Error('Request too large');}return JSON.parse(s||'{}');};
 if(url.pathname==='/api/pair'&&req.method==='POST'){
  const b=await body();let token:string;try{token=await pairing.pair(b.code,b.deviceName);}catch(e:any){reply(401,{error:e.message});return;}
  res.setHeader('Set-Cookie',cookie(token,req.headers.origin!==localOrigin&&origin.startsWith('https:')));reply(200,{ok:true});return;
 }
 const token=req.headers.cookie?.match(/(?:^|; )remote_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!pairing.authenticated(token)){reply(401,{error:'Pair this phone first'});return;}
 await pairing.refresh(token!);res.setHeader('Set-Cookie',cookie(token!,req.headers.origin!==localOrigin&&req.headers.host!==`127.0.0.1:${port}`&&origin.startsWith('https:')));
 if(url.pathname==='/api/status'){reply(200,{folder:path.basename(root),engine:'Codex app-server · real integration',mode,chats:await database.list(),job:job?{id:job.id,chatId:job.chatId,status:job.status,events:job.events,prompts:job.prompts}:null});return;}
 if(url.pathname==='/api/chats'&&req.method==='POST'){const chat=await database.create(mode);reply(201,chat);return;}
 if(url.pathname==='/api/chat'&&req.method==='GET'){const chat=await database.snapshot(url.searchParams.get('id')||'');reply(chat?200:404,chat||{error:'المحادثة غير موجودة'});return;}
 if(url.pathname==='/api/events'){
  const chatId=url.searchParams.get('chatId')||job?.chatId;const legacy=!url.searchParams.has('chatId');
  if(!chatId||!await database.chat(chatId)){reply(404,{error:'المحادثة غير موجودة'});return;}
  res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});let cursor=0;const current=job?.chatId===chatId?job:undefined;let previous='';
  let ticking=false;const tick=async()=>{if(ticking)return;ticking=true;try{if(!pairing.authenticated(token)){res.end();return;}if(legacy&&current){while(cursor<current.events.length)res.write(`data: ${JSON.stringify({text:current.events[cursor++]})}\n\n`);res.write(`data: ${JSON.stringify({status:current.status,prompts:current.prompts})}\n\n`);}else{const snapshot=await database.snapshot(chatId);const state={chat:snapshot,active:job?.chatId===chatId&&job.status==='running'?{id:job.id,prompts:job.prompts}:null};const json=JSON.stringify(state);if(json!==previous){res.write(`data: ${json}\n\n`);previous=json;}else res.write(': keepalive\n\n');}}catch{res.end();}finally{ticking=false;}};
  tick();const timer=setInterval(tick,400);req.on('close',()=>clearInterval(timer));return;
 }
 if(url.pathname==='/api/respond'&&req.method==='POST'){
  const b=await body();const callback=job?.id===b.jobId&&job?.replies.get(b.id);
  if(!callback||!b.answers||typeof b.answers!=='object'||Array.isArray(b.answers)||Object.values(b.answers).some(v=>typeof v!=='string')){reply(409,{error:'This prompt is no longer active'});return;}
  callback(b.answers);reply(200,{ok:true});return;
 }
 if(url.pathname==='/api/stop'&&req.method==='POST'){job?.controller.abort();reply(200,{ok:true});return;}
 if(url.pathname==='/api/task'&&req.method==='POST'){
  if(taskReserved||job?.status==='running'){reply(409,{error:'Stop or finish the current task first'});return;}
  const b=await body();if(typeof b.text!=='string'||!b.text.trim()||b.text.length>2000){reply(400,{error:'Enter a task under 2000 characters'});return;}
  if(taskReserved||job?.status==='running'){reply(409,{error:'مهمة أخرى راهي تخدم. استنى أو أوقفها أولاً.'});return;}
  if(b.chatId!==undefined&&(typeof b.chatId!=='string'||b.chatId.length>100)){reply(400,{error:'معرّف محادثة غير صالح'});return;}
  taskReserved=true;try{
  const chat=b.chatId?await database.chat(b.chatId):await database.create(mode);
  if(!chat){reply(404,{error:'المحادثة غير موجودة'});return;}if(chat.mode!==mode){reply(409,{error:'افتح محادثة جديدة لهذا الوضع'});return;}
  const current:Job={id:await database.job(chat.id,b.text),chatId:chat.id,status:'running',events:['Task received on your Mac.'],controller:new AbortController(),prompts:[],replies:new Map()};job=current;
  const emit=(s:string)=>{if(current.events.at(-1)!==s&&current.events.length<1000){current.events.push(s);database.event(current.id,'progress',s);}};emit('وصل الطلب إلى الماك.');
  reply(202,{id:current.id,chatId:current.chatId});void(async()=>{try{if(mode==='computer'){
   const ask=(prompt:Prompt)=>new Promise<Record<string,string>>((resolve,reject)=>{
    const id=randomUUID();const abort=()=>{cleanup();reject(new Error('Stopped by user'));};
    const cleanup=()=>{current.replies.delete(id);current.prompts=current.prompts.filter(p=>p.id!==id);current.controller.signal.removeEventListener('abort',abort);};
    current.replies.set(id,answers=>{database.event(current.id,'consent','تم إرسال ردّ المستخدم إلى طلب الموافقة.');cleanup();resolve(answers);});current.prompts.push({...prompt,id});database.event(current.id,'request',JSON.stringify({...prompt,id}));
    current.controller.signal.addEventListener('abort',abort,{once:true});if(current.controller.signal.aborted)abort();
   });
   await runAgent(b.text,root,current.controller.signal,emit,ask,{threadId:chat.threadId,onThread:async id=>{database.thread(chat.id,id);await database.flush();},onMessage:text=>{database.event(current.id,'assistant',text);current.events.push(text);}});
  }else{const a=await plan(b.text,root,current.controller.signal,emit);current.controller.signal.throwIfAborted();emit(`Action: ${a.operation}`);emit(await adapter.execute(a,current.controller.signal,emit));}current.status='completed';}catch(e:any){current.status=current.controller.signal.aborted?'stopped':'failed';emit(e.message);}finally{await database.finish(current.id,current.status);current.prompts=[];current.replies.clear();} })().catch(()=>{current.status='failed';current.prompts=[];current.controller.abort();});return;}finally{taskReserved=false;}
 }
 reply(404,{error:'Unknown API route'});
}catch(e:any){if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}}).listen(port,host,()=>{console.log(`Remote Mac: ${origin}\nTest folder: ${root}\nPair your phone using the local Mac pairing screen\nKeep this terminal private. Codex credentials remain on this Mac.`);});

startMacPanel(pairing,Number(process.env.MAC_PANEL_PORT||port+1),()=>job?.controller.abort());

for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{job?.controller.abort();setTimeout(()=>{void database.close().finally(()=>process.exit(0));},1000);});
