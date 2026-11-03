import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,posix} from 'node:path';
import ts from 'typescript';
import {buildWechat} from '../scripts/build-wechat.mjs';
test('WeChat output contains a standalone CommonJS graph, pinned engine and game configuration',async()=>{
 const result=await buildWechat({appid:'wx0123456789abcdef'});
 assert.ok(result.bytes<4*1024*1024,'Report actual package size; official console remains the authority on limits');
 const read=name=>readFile(join(result.root,name),'utf8');
 const project=JSON.parse(await read('project.config.json'));assert.equal(project.compileType,'game');assert.equal(project.appid,'wx0123456789abcdef');
 assert.equal(JSON.parse(await read('game.json')).deviceOrientation,'portrait');assert.match(await read('LICENSE-LayaAir.txt'),/MIT License/);
 const scripts=new Set(result.scripts);
 const hero=await readFile(join(result.root,'assets/hero/ruin-apprentice.png'));
 assert.equal(hero.readUInt32BE(16),1024);assert.equal(hero.readUInt32BE(20),1024);
 for(const name of scripts){
  const source=await read(name),ast=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length,0,name);
  function check(node){
   assert.ok(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node),'No browser ESM: '+name);
   if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='require'){
    assert.ok(ts.isStringLiteral(node.arguments[0]),'Static require only: '+name);
    const target=node.arguments[0].text;assert.ok(target.startsWith('./')||target.startsWith('../'));
    const path=posix.normalize(posix.join(posix.dirname(name),target));assert.ok(scripts.has(path),name+' -> '+path);
   }
   ts.forEachChild(node,check);
  }check(ast);
 }
 await assert.rejects(buildWechat({appid:'not-an-appid'}),/WECHAT_APPID/);
});
