import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';
const base='http://127.0.0.1:3100';
assert.equal((await fetch(base+'/api/status')).status,401);
assert.equal((await fetch(base+'/api/pair',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({code:process.argv[2]})})).status,403);
const r=await fetch(base+'/api/pair',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({code:process.argv[2]})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie')!.split(';')[0];
const headers={cookie,origin:base,'content-type':'application/json'};
assert.equal((await fetch(base+'/api/pair',{method:'POST',headers,body:JSON.stringify({code:process.argv[2]})})).status,401);
const start=await fetch(base+'/api/task',{method:'POST',headers,body:JSON.stringify({text:'رتّب الملفات في دوسي التجربة حسب النوع'})});assert.equal(start.status,202);
const stream=await fetch(base+'/api/events',{headers:{cookie}});const reader=stream.body!.getReader();let transcript='';
for(;;){const chunk=await reader.read();if(chunk.done)break;transcript+=new TextDecoder().decode(chunk.value);if(/"status":"(completed|failed|stopped)"/.test(transcript)){await reader.cancel();break;}}
console.log(transcript);assert.match(transcript,/"status":"completed"/);assert.equal(await fs.readFile('work/test-folder/txt/report.txt','utf8'),'example');assert.equal(await fs.readFile('work/test-folder/jpg/photo.jpg','utf8'),'example');console.log('REAL CODEX E2E PASSED');
