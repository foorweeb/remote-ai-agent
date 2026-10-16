import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomBytes,randomInt,randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
const Device=z.object({id:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),name:z.string().max(100),pairedAt:z.number(),expiresAt:z.number()}).strict();
const State=z.object({version:z.literal(1),devices:z.array(Device)}).strict();
export const COOKIE_SECONDS=400*24*60*60;
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export class PairingStore {
 private devices:z.infer<typeof Device>[]=[];
 private code='';private expires=0;private attempts=0;private writing=Promise.resolve();
 constructor(readonly file:string){}
 async load(){
  try{this.devices=State.parse(JSON.parse(await fs.readFile(this.file,'utf8'))).devices.filter(d=>d.expiresAt>Date.now());}
  catch(e:any){if(e.code!=='ENOENT')throw new Error('Cannot read paired devices. Refusing to reset trust silently.');}
  this.newCode();
 }
 newCode(){this.code=String(randomInt(100000,1000000));this.expires=Date.now()+300000;this.attempts=0;}
 localStatus(){return {code:this.code&&Date.now()<this.expires&&this.attempts<10?this.code:null,expiresAt:this.expires,devices:this.devices.map(({id,name,pairedAt})=>({id,name,pairedAt}))};}
 async pair(code:unknown,name:unknown){
  if(!this.code||Date.now()>this.expires||this.attempts>=10)throw new Error('رمز الربط انتهى أو استُعمل. افتح واجهة الماك وأنشئ رمزاً جديداً.');
  this.attempts++;if(code!==this.code)throw new Error('رمز الربط غير صحيح');
  this.code='';const token=randomBytes(32).toString('hex');
  const device={id:randomUUID(),hash:digest(token),name:typeof name==='string'?name.trim().slice(0,100)||'Phone browser':'Phone browser',pairedAt:Date.now(),expiresAt:Date.now()+COOKIE_SECONDS*1000};
  this.devices.push(device);
  try{await this.save();}catch(e){this.devices=this.devices.filter(d=>d.id!==device.id);throw e;}
  return token;
 }
 authenticated(token:string|undefined){return !!token&&this.devices.some(d=>d.hash===digest(token)&&d.expiresAt>Date.now());}
 async refresh(token:string){const device=this.devices.find(d=>d.hash===digest(token));if(device&&device.expiresAt-Date.now()<COOKIE_SECONDS*1000-86400000){device.expiresAt=Date.now()+COOKIE_SECONDS*1000;await this.save();}}
 async revokeAll(){const previous=this.devices;this.devices=[];try{await this.save();}catch(e){this.devices=previous;throw e;}}
 private save(){const json=JSON.stringify({version:1,devices:this.devices});const write=this.writing.then(async()=>{
  await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});await fs.chmod(path.dirname(this.file),0o700);
  const temp=this.file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,json,{mode:0o600,flag:'wx'});await fs.rename(temp,this.file);}finally{await fs.rm(temp,{force:true});}
 });this.writing=write.catch(()=>{});return write;}
}
