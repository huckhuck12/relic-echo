import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import ts from 'typescript';
import {buildPages,pagesRoot} from '../scripts/build-pages.mjs';
import {createStaticServer} from '../scripts/serve.mjs';
import {join} from 'node:path';

async function listFiles(root,prefix=''){
 const files=[];for(const entry of await readdir(root,{withFileTypes:true})){
  const name=prefix+entry.name;
  if(entry.isDirectory())files.push(...await listFiles(join(root,entry.name),name+'/'));else files.push(name);
 }return files;
}

test('Pages package is standalone and all entry/module URLs resolve at root and repository subpath',async()=>{
 const result=await buildPages(),files=new Set(await listFiles(pagesRoot));
 assert.ok(result.modules>0);assert.ok(files.has('.nojekyll'));assert.ok(files.has('index.html'));
 assert.ok(files.has('vendor/laya.core.js'));assert.ok(files.has('vendor/laya.webgl.js'));
 assert.ok([...files].every(p=>p==='index.html'||p==='.nojekyll'||p.startsWith('vendor/')||/^dist\/(?:[\w-]+\/)*[\w-]+\.js$/.test(p)));
 for(const base of ['', '/a-repository-name']){
  const server=createStaticServer({root:pagesRoot,base});server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
   const origin=`http://127.0.0.1:${server.address().port}`,entry=new URL(origin+base+'/');
   const response=await fetch(entry);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
   const html=await response.text(),queue=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>new URL(m[1],entry)),seen=new Set();
   while(queue.length){
    const url=queue.shift();if(seen.has(url.href))continue;seen.add(url.href);
    assert.equal(url.origin,origin);assert.ok(url.pathname.startsWith(base+'/'));
    // Windows 文件系统不敏感，因此还要对照实际文件名大小写，防止 Linux Pages 才暴露错误。
    const relative=url.pathname.slice(base.length+1);assert.ok(files.has(relative),`Missing exact-case asset: ${relative}`);
    const asset=await fetch(url);assert.equal(asset.status,200,url.href);assert.match(asset.headers.get('content-type'),/javascript/);
    const body=await asset.text();
    if(relative.startsWith('dist/')){
     assert.ok(!body.includes('sourceMappingURL='));
     for(const ref of ts.preProcessFile(body,true,true).importedFiles){assert.ok(ref.fileName.startsWith('.'),`Non-relative module: ${ref.fileName}`);queue.push(new URL(ref.fileName,url));}
    }
   }
   assert.ok(seen.size>35,'entry should reach the real game, UI and Buff modules');
   assert.equal((await fetch(origin+base+'/missing.js')).status,404);
   if(base){const redirect=await fetch(origin+base,{redirect:'manual'});assert.equal(redirect.headers.get('location'),base+'/');assert.equal((await fetch(origin+'/dist/main.js')).status,404);}
  }finally{await new Promise(resolve=>server.close(resolve));}
 }
});

test('Pages rebuild replaces stale output rather than depending on source files or local caches',async()=>{
 await writeFile(join(pagesRoot,'stale.js'),'old generated module');await buildPages();
 await assert.rejects(readFile(join(pagesRoot,'stale.js')),error=>error.code==='ENOENT');
 const main=await readFile(join(pagesRoot,'dist/main.js'),'utf8');assert.match(main,/\.\/game\/game\.js/);
});

test('development preview modules resolve after source directories are reorganized',async()=>{
 const {fileURLToPath}=await import('node:url');
 for(const name of await readdir(new URL('../bench/',import.meta.url))){
  if(!name.endsWith('.js'))continue;
  const file=new URL('../bench/'+name,import.meta.url),body=await readFile(file,'utf8');
  for(const ref of ts.preProcessFile(body,true,true).importedFiles){
   assert.ok(ref.fileName.startsWith('.'));
   await assert.doesNotReject(readFile(new URL(ref.fileName,file)),`Missing preview dependency in ${fileURLToPath(file)}: ${ref.fileName}`);
  }
 }
});
