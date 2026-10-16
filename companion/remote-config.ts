import {readFileSync,existsSync} from 'node:fs';import path from 'node:path';
export function validateRemoteOrigin(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Remote origin must be an HTTPS origin without credentials, paths or query parameters');return url.origin;}
export function configuredRemoteOrigin(){if(process.env.APP_ORIGIN)return process.env.APP_ORIGIN;const file=path.resolve('.remote-mac/remote-access.json');if(!existsSync(file))return undefined;return validateRemoteOrigin(JSON.parse(readFileSync(file,'utf8')).origin);}
export function allowedOrigins(remote:string,local:string){return new Set([remote,local]);}
