import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory=resolve('artifacts','edge-performance-'+Date.now());await mkdir(directory,{recursive:true});
const browserPath=process.env.PERF_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const child=spawn(browserPath,['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--disable-renderer-backgrounding','--disable-background-timer-throttling','--remote-debugging-port=0',`--user-data-dir=${directory}`,'--window-size=1280,720',`http://localhost:8080/bench/index.html${process.argv.includes('--quick')?'?quick':''}`],{windowsHide:true,stdio:['ignore','ignore','pipe']});
child.stderr.on('data',chunk=>process.stderr.write(chunk));child.on('error',error=>console.error(error));child.on('exit',code=>console.log('Edge exit:',code));
let ws;
try {
  let port;for(let i=0;i<100;i++){try{port=Number((await readFile(resolve(directory,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await new Promise(r=>setTimeout(r,200));}}
  if(!port)throw new Error('Edge did not expose a debugging port within 20 seconds');
  let pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();const page=pages.find(p=>p.url.includes('/bench/'));if(!page)throw new Error(JSON.stringify(pages));
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let serial=0;const pending=new Map();ws.onmessage=e=>{const value=JSON.parse(e.data);const p=pending.get(value.id);if(p){pending.delete(value.id);p(value);}};
  const evaluate=expression=>new Promise(r=>{const id=++serial;pending.set(id,r);ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));});
  const start=Date.now();let last='';
  while(Date.now()-start<240000){
    const response=await evaluate('({result:window.benchmarkResult,error:window.benchmarkError,progress:window.benchmarkProgress})');const state=response.result?.result?.value;
    if(state?.error)throw new Error(state.error);
    if(state?.progress!==last){last=state?.progress;console.log(last);}
    if(state?.result){await writeFile(process.argv.find(x=>x.endsWith('.json'))||'artifacts/performance-browser.json',JSON.stringify(state.result,null,2));console.log(JSON.stringify(state.result));break;}
    await new Promise(r=>setTimeout(r,1000));
  }
  if(last!=='complete')throw new Error('Benchmark timed out');
}finally{ws?.close();child.kill();}

