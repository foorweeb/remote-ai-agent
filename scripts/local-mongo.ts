import {spawn} from 'node:child_process';import {mkdirSync,chmodSync,existsSync} from 'node:fs';import path from 'node:path';
const root=path.resolve('.remote-mac');const data=path.join(root,'mongodb');mkdirSync(data,{recursive:true,mode:0o700});chmodSync(root,0o700);chmodSync(data,0o700);
const bundled=path.join(root,'bin/mongod');const binary=process.env.MONGOD_BIN||(existsSync(bundled)?bundled:'mongod');
const child=spawn(binary,['--dbpath',data,'--bind_ip','127.0.0.1','--port','27017','--logpath',path.join(root,'mongodb.log')],{stdio:'inherit'});
child.on('error',()=>{console.error('mongod unavailable. Install MongoDB Community or set MONGOD_BIN to its local binary.');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code||0;});for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>child.kill(signal));console.log('MongoDB local: 127.0.0.1:27017 · persistent data in .remote-mac/mongodb · never forward this port.');
