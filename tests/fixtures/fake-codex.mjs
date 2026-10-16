#!/usr/bin/env node
// Protocol test double only. Never used by the application by default.
import {createInterface} from 'node:readline';
if(process.argv[2]==='mcp'){console.log(JSON.stringify([{name:'cua_repl',enabled:true,transport:{type:'stdio',command:process.execPath,args:[]}}]));process.exit(0);}
const send=m=>console.log(JSON.stringify(m));let input='';
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
 if(m.method==='initialize')send({id:m.id,result:{}});
 if(m.method==='thread/resume'){send({id:m.id,result:{thread:{id:m.params.threadId}}});}
 if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'test-thread'}}});
 if(m.method==='turn/start'){
  input=m.params.input[0].text;send({id:m.id,result:{turn:{id:'test-turn'}}});
  if(process.env.MOCK_AGENT_MODE==='hang')return;
  if(process.env.MOCK_AGENT_MODE==='elicitation'){send({id:901,method:'mcpServer/elicitation/request',params:{serverName:'cua_repl',_meta:{connector_id:'computer-use',persist:process.env.MOCK_ALLOW_ALWAYS==='1'?['session','always']:['session'],tool_params:{app:'com.google.Chrome'}},mode:'form',message:'Allow Computer Use to use Chrome?',requestedSchema:{type:'object',properties:{}}}});return;}
  send({id:900,method:'item/tool/requestUserInput',params:{questions:[{id:'confirm',question:'Simulated confirmation',options:[{label:'Yes'},{label:'No'}]}]}});
 }
 if(m.id===901&&m.result){send({method:'item/agentMessage/delta',params:{delta:JSON.stringify(m.result)}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}
 if(m.id===900&&m.result){
  const answer=m.result.answers.confirm.answers[0];
  send({method:'item/started',params:{item:{type:'mcpToolCall',server:'cua_repl',tool:'js'}}});
  send({method:'item/agentMessage/delta',params:{delta:`${input}: ${answer}`}});
  send({method:'item/completed',params:{item:{type:'agentMessage',text:`${input}: ${answer}`}}});
  send({method:'turn/completed',params:{turn:{status:'completed'}}});
 }
});
