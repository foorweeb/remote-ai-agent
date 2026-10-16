import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
export const Action = z.object({operation:z.enum(['list','mkdir','organize','unsupported']),folder:z.string().max(100),message:z.string().max(1000)}).strict();
export type Action = z.infer<typeof Action>;
export const schema = {type:'object',properties:{operation:{type:'string',enum:['list','mkdir','organize','unsupported']},folder:{type:'string'},message:{type:'string'}},required:['operation','folder','message'],additionalProperties:false};
export interface ExecutionAdapter { execute(action:Action, signal:AbortSignal, emit:(text:string)=>void):Promise<string> }
// This adapter is the capability boundary. Future MCP adapters implement the same interface.
export class FileAdapter implements ExecutionAdapter {
 constructor(readonly root:string){}
 async execute(input:Action, signal:AbortSignal, emit:(text:string)=>void) {
  const a=Action.parse(input); const check=()=>signal.throwIfAborted(); check();
  if(a.operation==='unsupported') throw new Error(a.message || 'Only list, create folder, and organize are supported. Deletion and overwrite require confirmation and are disabled.');
  const entries=await fs.readdir(this.root,{withFileTypes:true});
  if(a.operation==='list') return entries.map(e=>`${e.isDirectory()?'📁':'📄'} ${e.name}`).join('\n') || 'Folder is empty.';
  if(a.operation==='mkdir') {
   if(!/^[\p{L}\p{N} _-]{1,100}$/u.test(a.folder)||a.folder==='.'||a.folder==='..') throw new Error('Use a single folder name without paths.');
   check(); await fs.mkdir(path.join(this.root,a.folder)); return `Created ${a.folder}`;
  }
  let moved=0, skipped=0;
  for(const entry of entries) {
   check(); if(!entry.isFile()||entry.name.startsWith('.')) {skipped++;continue;}
   const ext=path.extname(entry.name).slice(1).toLowerCase();
   const group=/^[a-z0-9]{1,16}$/.test(ext)?ext:'other'; const dir=path.join(this.root,group);
   try {await fs.mkdir(dir);} catch(e:any){if(e.code!=='EEXIST')throw e;}
   const stat=await fs.lstat(dir); if(!stat.isDirectory()||stat.isSymbolicLink()) throw new Error(`Unsafe destination: ${group}`);
   const source=path.join(this.root,entry.name), dest=path.join(dir,entry.name);
   // COPYFILE_EXCL never replaces a destination. Reject symlink sources, including late swaps.
   const handle=await fs.open(source,constants.O_RDONLY|constants.O_NOFOLLOW);
   try {
    const before=await handle.stat(); if(!before.isFile())throw new Error('Source changed'); check();
    let output; try {output=await fs.open(dest,'wx');} catch(e:any){if(e.code==='EEXIST'){skipped++;emit(`Skipped conflict: ${entry.name}`);continue;}throw e;}
    try {const buffer=Buffer.alloc(65536);for(;;){const {bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;await output.writeFile(buffer.subarray(0,bytesRead));}} finally {await output.close();}
    const after=await fs.lstat(source);
    if(after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs) throw new Error(`Source changed; copy retained: ${entry.name}`);
    await fs.unlink(source); moved++;emit(`${entry.name} → ${group}/`);
   } finally {await handle.close();}
  }
  return `Organized ${moved} files by type. Skipped ${skipped} folders, hidden files, symlinks, or conflicts.`;
 }
}
