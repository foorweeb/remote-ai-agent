import {MongoClient,type Db} from 'mongodb';import {randomUUID} from 'node:crypto';
export type Chat={id:string,title:string,mode:string,threadId:string|null,createdAt:number,updatedAt:number};
export type Job={id:string,chatId:string,text:string,status:string,createdAt:number,updatedAt:number};
export type ChatEvent={id:string,jobId:string,kind:string,text:string,createdAt:number};
export class ChatDatabase{
 readonly client:MongoClient;readonly db:Db;private writes=Promise.resolve();private failed=false;onFailure?:()=>void;
 constructor(uri=process.env.MONGODB_URI||'mongodb://127.0.0.1:27017',name=process.env.MONGODB_DATABASE||'remote_mac'){
  this.client=new MongoClient(uri,{serverSelectionTimeoutMS:5000,connectTimeoutMS:5000});this.db=this.client.db(name);
 }
 async connect(){try{await this.client.connect();await this.db.command({ping:1});await Promise.all([
  this.db.collection('chats').createIndex({id:1},{unique:true}),this.db.collection('jobs').createIndex({id:1},{unique:true}),this.db.collection('events').createIndex({id:1},{unique:true}),this.db.collection('chats').createIndex({updatedAt:-1}),this.db.collection('jobs').createIndex({chatId:1,createdAt:1}),this.db.collection('events').createIndex({jobId:1,createdAt:1})]);
 }catch{await this.client.close();throw new Error('MongoDB غير متصلة. شغّل MongoDB محلياً أو راجع MONGODB_URI على الماك.');}}
 private queue(write:()=>Promise<unknown>){this.writes=this.writes.then(async()=>{if(!this.failed)await write();}).catch(()=>{this.failed=true;this.onFailure?.();});}
 async flush(){await this.writes;if(this.failed)throw new Error('تعذر حفظ البيانات في MongoDB. أُوقفت المهمة لحماية السجل.');}
 async create(mode:string,title='محادثة جديدة'):Promise<Chat>{await this.flush();const now=Date.now();const chat={id:randomUUID(),title,mode,threadId:null,createdAt:now,updatedAt:now};await this.db.collection<Chat>('chats').insertOne({...chat});return chat;}
 async list(){await this.flush();return this.db.collection<Chat>('chats').find({},{projection:{_id:0}}).sort({updatedAt:-1,_id:-1}).limit(100).toArray();}
 async chat(id:string){await this.flush();return this.db.collection<Chat>('chats').findOne({id},{projection:{_id:0}});}
 thread(id:string,threadId:string){this.queue(()=>this.db.collection('chats').updateOne({id},{$set:{threadId}}));}
 async job(chatId:string,text:string){await this.flush();const id=randomUUID(),now=Date.now();await this.db.collection<Job>('jobs').insertOne({id,chatId,text,status:'running',createdAt:now,updatedAt:now});await this.db.collection('chats').updateOne({id:chatId},{$set:{updatedAt:now}});await this.db.collection('chats').updateOne({id:chatId,title:'محادثة جديدة'},{$set:{title:text.slice(0,60)}});return id;}
 event(jobId:string,kind:string,text:string){const event:ChatEvent={id:randomUUID(),jobId,kind,text,createdAt:Date.now()};this.queue(()=>this.db.collection<ChatEvent>('events').insertOne(event));}
 async finish(jobId:string,status:string){await this.flush();const now=Date.now();const job=await this.db.collection<Job>('jobs').findOneAndUpdate({id:jobId},{$set:{status,updatedAt:now}},{returnDocument:'after'});if(job)await this.db.collection('chats').updateOne({id:job.chatId},{$set:{updatedAt:now}});}
 async snapshot(id:string){const chat=await this.chat(id);if(!chat)return null;const jobs=await this.db.collection<Job>('jobs').find({chatId:id},{projection:{_id:0}}).sort({createdAt:1,_id:1}).toArray();const events=await this.db.collection<ChatEvent>('events').find({jobId:{$in:jobs.map(j=>j.id)}},{projection:{_id:0}}).sort({createdAt:1,_id:1}).toArray();return {...chat,jobs:jobs.map(j=>({...j,events:events.filter(e=>e.jobId===j.id)}))};}
 async recover(){await this.flush();for await(const job of this.db.collection<Job>('jobs').find({status:'running'})){await this.db.collection('events').updateOne({id:`recovery:${job.id}`},{$setOnInsert:{id:`recovery:${job.id}`,jobId:job.id,kind:'system',text:'توقفت المهمة بعد إعادة تشغيل الماك أو التطبيق. راجع آخر نتيجة قبل طلب المتابعة؛ لن تُعاد الإجراءات تلقائياً.',createdAt:Date.now()}},{upsert:true});await this.finish(job.id,'interrupted');}}
 async close(){await this.writes;await this.client.close();}
}
