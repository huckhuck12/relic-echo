import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

test('Laya test double conforms to the public engine types and rejects private APIs',()=>{
 const program=ts.createProgram(['tests/types/laya-contract.ts'],{noEmit:true,allowJs:true,checkJs:false,strictNullChecks:true,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020,moduleResolution:ts.ModuleResolutionKind.NodeJs});
 const diagnostics=ts.getPreEmitDiagnostics(program);
 assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
});
