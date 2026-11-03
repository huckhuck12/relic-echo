import {mkdir,readFile,writeFile,rm,cp,readdir,stat} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url));
export const wechatRoot=resolve(root,'_wechat');
const pinnedHashes={'laya.core.js':'6c7a67c7b29671d339919ba62ed346783c78cc0c6b06832e1615da43dd5027db','laya.webgl.js':'5cb72db51ea2283346d347b0858d567bed915cdb7f1693abe8eb7c3419bc540c','laya.wxmini.js':'ea58de6c73718401b3c606189afe1c3e76741422b32a1e8b2171c99fbd078c64'};
export async function buildWechat({appid=process.env.WECHAT_APPID || 'touristappid'}={}) {
  const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
  if(appid!=='touristappid'&&!/^wx[0-9a-f]{16}$/i.test(appid))throw Error('WECHAT_APPID must be a WeChat AppID (wx + 16 hex digits).');
  const libs={};
  for(const [name,hash] of Object.entries(pinnedHashes)){
    const source=await readFile(join(root,'vendor',name),'utf8');
    if(createHash('sha256').update(source.replaceAll('\r\n','\n')).digest('hex')!==hash)throw Error(`${name} changed: revalidate the pinned WeChat adapter before building.`);
    libs[name]=source;
  }
  const core=libs['laya.core.js'],output=new Map();
  const config=ts.readConfigFile(join(root,'tsconfig.json'),ts.sys.readFile);
  if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
  const options={...parsed.options,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2018,outDir:join(wechatRoot,'app'),sourceMap:false};
  const program=ts.createProgram(parsed.fileNames,options);
  const diagnostics=ts.getPreEmitDiagnostics(program);
  if(diagnostics.length)throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
  // Devtools may hold this directory open on Windows. Clean its contents rather
  // than removing the project root, and keep the tool's private local settings.
  await mkdir(wechatRoot,{recursive:true});
  for(const name of await readdir(wechatRoot)){
    if(name!=='project.private.config.json')await rm(join(wechatRoot,name),{recursive:true,force:true});
  }
  const emitted=program.emit(undefined,(filename,source)=>{
    // TS emitter is synchronous; collect files and write them below.
    output.set(filename,'var Laya = GameGlobal.Laya;\n'+source.replaceAll('__RELIC_VERSION__',version));
  });
  if(emitted.emitSkipped)throw Error('WeChat TypeScript emit failed.');
  for(const [filename,source]of output){await mkdir(resolve(filename,'..'),{recursive:true});await writeFile(filename,source);}
  output.clear();
  for(const name of ['game.js','engine-environment.js']){
    const source=(await readFile(join(root,'wechat',name),'utf8')).replaceAll('__RELIC_VERSION__',JSON.parse(await readFile(join(root,'package.json'),'utf8')).version);
    const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2018,module:ts.ModuleKind.CommonJS},fileName:name});
    await writeFile(join(wechatRoot,name),result.outputText);
  }
  await cp(join(root,'wechat/game.json'),join(wechatRoot,'game.json'));
  await cp(join(root,'assets'),join(wechatRoot,'assets'),{recursive:true});
  const project=JSON.parse(await readFile(join(root,'wechat/project.config.json'),'utf8'));project.appid=appid;
  await writeFile(join(wechatRoot,'project.config.json'),JSON.stringify(project,null,2)+'\n');
  const webgl=libs['laya.webgl.js'],adapter=libs['laya.wxmini.js'];
  const engineBindings='var window=GameGlobal.__relicEngineWindow, document=window.document, wx=window.wx, laya=window.laya||(window.laya={});\n'
    +'var CanvasRenderingContext2D=window.CanvasRenderingContext2D, ImageData=window.ImageData, performance=window.performance;\n';
  await writeFile(join(wechatRoot,'engine.js'),engineBindings+core+'\n'+webgl+'\n'+adapter);
  await cp(join(root,'vendor/LICENSE-LayaAir.txt'),join(wechatRoot,'LICENSE-LayaAir.txt'));
  async function files(dir){const names=[];for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);names.push(...e.isDirectory()?await files(path):[path]);}return names;}
  const all=await files(wechatRoot),scripts=all.filter(f=>f.endsWith('.js')).map(f=>relative(wechatRoot,f).replaceAll('\\','/'));
  let bytes=0;for(const f of all)bytes+=(await stat(f)).size;
  const manifest={version:JSON.parse(await readFile(join(root,'package.json'),'utf8')).version,engine:'2.0.2',orientation:'portrait',scripts,bytes};
  await writeFile(join(wechatRoot,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {root:wechatRoot,...manifest};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(await buildWechat(),null,2));
