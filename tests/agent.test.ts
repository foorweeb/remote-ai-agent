import {test} from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {runAgent,computerConfig} from '../companion/agent.js';
test('simulated protocol: direct text, computer config, phone question and completion',async()=>{
 const prior=process.env.CODEX_BIN;process.env.CODEX_BIN=path.resolve('tests/fixtures/fake-codex.mjs');
 try{const config=await computerConfig();assert.equal(config['features.shell_tool'],false);assert.equal(config['features.multi_agent'],false);const events:string[]=[];
 const result=await runAgent('افتح كروم',process.cwd(),new AbortController().signal,s=>events.push(s),async prompt=>{assert.equal(prompt.questions[0].id,'confirm');return {confirm:'Yes'};});assert.equal(result,'افتح كروم: Yes');assert.ok(events.some(e=>e==='Computer Use: cua_repl/js'));}
 finally{if(prior===undefined)delete process.env.CODEX_BIN;else process.env.CODEX_BIN=prior;}
});
test('simulated protocol: stop kills an unfinished turn',async()=>{
 const prior=process.env.CODEX_BIN;process.env.CODEX_BIN=path.resolve('tests/fixtures/fake-codex.mjs');process.env.MOCK_AGENT_MODE='hang';
 const c=new AbortController();try{await assert.rejects(runAgent('test',process.cwd(),c.signal,()=>{setTimeout(()=>c.abort(),20);},async()=>({})),/إيقاف|aborted/);}finally{delete process.env.MOCK_AGENT_MODE;if(prior===undefined)delete process.env.CODEX_BIN;else process.env.CODEX_BIN=prior;}
});
test('simulated MCP consent: explicit accept once and decline are forwarded',async()=>{
 const prior=process.env.CODEX_BIN;process.env.CODEX_BIN=path.resolve('tests/fixtures/fake-codex.mjs');process.env.MOCK_AGENT_MODE='elicitation';try{
  for(const consent of ['accept','decline']){const result=await runAgent('test',process.cwd(),new AbortController().signal,()=>{},async prompt=>{assert.match(prompt.questions[0].question,/Allow Computer Use/);return {consent};});assert.deepEqual(JSON.parse(result),{action:consent,content:consent==='accept'?{}:null});}
 }finally{delete process.env.MOCK_AGENT_MODE;if(prior===undefined)delete process.env.CODEX_BIN;else process.env.CODEX_BIN=prior;}
});
test('simulated persistent app consent: only when backend offers always',async()=>{
 const prior=process.env.CODEX_BIN;process.env.CODEX_BIN=path.resolve('tests/fixtures/fake-codex.mjs');process.env.MOCK_AGENT_MODE='elicitation';try{
 for(const supported of [true,false]){process.env.MOCK_ALLOW_ALWAYS=supported?'1':'0';const result=await runAgent('test',process.cwd(),new AbortController().signal,()=>{},async prompt=>{assert.equal(prompt.questions[0].options?.some(o=>o.label==='accept_always'),supported);return {consent:'accept_always'};});assert.deepEqual(JSON.parse(result),supported?{action:'accept',content:{},_meta:{persist:'always'}}:{action:'decline',content:null});}
 }finally{delete process.env.MOCK_AGENT_MODE;delete process.env.MOCK_ALLOW_ALWAYS;if(prior===undefined)delete process.env.CODEX_BIN;else process.env.CODEX_BIN=prior;}
});
test('simulated resume: uses stored Codex thread instead of a new context',async()=>{const prior=process.env.CODEX_BIN;process.env.CODEX_BIN=path.resolve('tests/fixtures/fake-codex.mjs');try{let resumed='';await runAgent('follow-up',process.cwd(),new AbortController().signal,()=>{},async()=>({confirm:'Yes'}),{threadId:'saved-thread',onThread:id=>{resumed=id;}});assert.equal(resumed,'saved-thread');}finally{if(prior===undefined)delete process.env.CODEX_BIN;else process.env.CODEX_BIN=prior;}});
