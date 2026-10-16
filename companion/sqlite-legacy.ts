import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
export class ChatDatabase{
 readonly db:DatabaseSync;
 constructor(file:string){mkdirSync(path.dirname(file),{recursive:true,mode:0o700});chmodSync(path.dirname(file),0o700);this.db=new DatabaseSync(file);chmodSync(file,0o600);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY,title TEXT NOT NULL,mode TEXT NOT NULL,threadId TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,chatId TEXT NOT NULL REFERENCES chats(id),text TEXT NOT NULL,status TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,jobId TEXT NOT NULL REFERENCES jobs(id),kind TEXT NOT NULL,text TEXT NOT NULL,createdAt INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS jobs_chat ON jobs(chatId,createdAt);CREATE INDEX IF NOT EXISTS events_job ON events(jobId,id);PRAGMA user_version=1;`);
 }
 create(mode:string,title='محادثة جديدة'){const id=randomUUID(),now=Date.now();this.db.prepare('INSERT INTO chats VALUES(?,?,?,NULL,?,?)').run(id,title,mode,now,now);return this.chat(id)!;}
 list(){return this.db.prepare('SELECT * FROM chats ORDER BY updatedAt DESC, rowid DESC LIMIT 100').all();}
 chat(id:string){return this.db.prepare('SELECT * FROM chats WHERE id=?').get(id) as {id:string,title:string,mode:string,threadId:string|null,createdAt:number,updatedAt:number}|undefined;}
 thread(id:string,threadId:string){this.db.prepare('UPDATE chats SET threadId=? WHERE id=?').run(threadId,id);}
 job(chatId:string,text:string){const id=randomUUID(),now=Date.now();this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?)').run(id,chatId,text,'running',now,now);this.db.prepare("UPDATE chats SET updatedAt=?,title=CASE WHEN title='محادثة جديدة' THEN ? ELSE title END WHERE id=?").run(now,text.slice(0,60),chatId);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return id;}
 event(jobId:string,kind:string,text:string){this.db.prepare('INSERT INTO events(jobId,kind,text,createdAt) VALUES(?,?,?,?)').run(jobId,kind,text,Date.now());}
 finish(jobId:string,status:string){const now=Date.now();this.db.prepare('UPDATE jobs SET status=?,updatedAt=? WHERE id=?').run(status,now,jobId);this.db.prepare('UPDATE chats SET updatedAt=? WHERE id=(SELECT chatId FROM jobs WHERE id=?)').run(now,jobId);}
 snapshot(id:string){const chat=this.chat(id);if(!chat)return null;const jobs=this.db.prepare('SELECT * FROM jobs WHERE chatId=? ORDER BY createdAt,rowid').all(id).map(row=>{const j=row as {id:string,chatId:string,text:string,status:string,createdAt:number,updatedAt:number};return ({...j,events:this.db.prepare('SELECT * FROM events WHERE jobId=? ORDER BY id').all(j.id!)});});return {...chat,jobs};}
 recover(){const jobs=this.db.prepare("SELECT id FROM jobs WHERE status='running'").all();this.db.exec('BEGIN IMMEDIATE');try{for(const job of jobs){this.event(String(job.id),'system','توقفت المهمة بعد إعادة تشغيل الماك أو التطبيق. راجع آخر نتيجة قبل طلب المتابعة؛ لن تُعاد الإجراءات تلقائياً.');this.finish(String(job.id),'interrupted');}this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 close(){this.db.close();}
}
