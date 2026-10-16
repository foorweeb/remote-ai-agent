import {test} from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import {PairingStore} from '../companion/pairing.js';
test('pair once: trust survives restart, raw token never stored, revoke persists',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'remote-pair-'));const file=path.join(dir,'private/devices.json');try{
  const first=new PairingStore(file);await first.load();const code=first.localStatus().code;assert.match(code!,/^\d{6}$/);await assert.rejects(first.pair('bad','phone'));
  const token=await first.pair(code,'My phone');assert.equal(first.authenticated(token),true);await assert.rejects(first.pair(code,'duplicate'));const disk=await fs.readFile(file,'utf8');assert.ok(!disk.includes(token));assert.equal((await fs.stat(file)).mode&0o777,0o600);assert.equal((await fs.stat(path.dirname(file))).mode&0o777,0o700);
  const restarted=new PairingStore(file);await restarted.load();assert.equal(restarted.authenticated(token),true);assert.equal(restarted.localStatus().devices[0].name,'My phone');await restarted.revokeAll();assert.equal(restarted.authenticated(token),false);
  const afterRevoke=new PairingStore(file);await afterRevoke.load();assert.equal(afterRevoke.authenticated(token),false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('pairing codes lock after ten guesses and corrupt trust fails closed',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'remote-pair-'));const file=path.join(dir,'devices.json');try{const store=new PairingStore(file);await store.load();const code=store.localStatus().code;for(let i=0;i<10;i++)await assert.rejects(store.pair('bad','phone'));await assert.rejects(store.pair(code,'phone'));store.newCode();assert.ok(await store.pair(store.localStatus().code,'phone'));await fs.writeFile(file,'not json');await assert.rejects(new PairingStore(file).load(),/Refusing/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
