// Idempotent, additive migration. Keeps the original SQLite file untouched.
import {DatabaseSync} from 'node:sqlite';import {existsSync} from 'node:fs';import path from 'node:path';import {ChatDatabase} from '../companion/database.js';
const file=path.resolve(process.env.CHAT_DATABASE_FILE||'.remote-mac/chats.sqlite');if(!existsSync(file))throw new Error('No legacy SQLite database to migrate');
const source=new DatabaseSync(file,{readOnly:true});const target=new ChatDatabase();await target.connect();
try{let count=0;for(const table of ['chats','jobs','events'])for(const row of source.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()){
 const doc={...row,id:table==='events'?`sqlite:${row.id}`:row.id};await target.db.collection(table).updateOne({id:doc.id},{$setOnInsert:doc},{upsert:true});count++;
}console.log(`Migration completed: ${count} records checked/imported. Original SQLite retained.`);}finally{source.close();await target.close();}
