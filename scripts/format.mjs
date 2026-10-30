import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// 使用项目锁定的 TypeScript 语法打印器，不添加运行时依赖；展开压缩语句并保留注释。
const sourceRoot = new URL('../src/', import.meta.url);
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
const check = process.argv.includes('--check');
let changed = 0;
async function collect(root, prefix = '') {
    const files = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (entry.isDirectory()) files.push(...await collect(new URL(entry.name + '/', root), name + '/'));
        else if (name.endsWith('.ts')) files.push(name);
    }
    return files;
}
for (const name of (await collect(sourceRoot)).sort()) {
    const path = new URL(name, sourceRoot), original = await readFile(path, 'utf8');
    let formatted = original.replace(/\uFEFF/g, '');
    // 打印器对旧的一行函数有时分两次展开；归一化到稳定结果，保证 format:check 幂等。
    for (let pass = 0; pass < 4; pass++) {
        const source = ts.createSourceFile(fileURLToPath(path), formatted, ts.ScriptTarget.Latest, true);
        if (source.parseDiagnostics.length) throw new Error(`Cannot format invalid TypeScript: ${name}`);
        const expand = node => {
            if (ts.isBlock(node) && node.statements.length > 1) node.multiLine = true;
            if (ts.isObjectLiteralExpression(node) && node.properties.length >= 5) node.multiLine = true;
            ts.forEachChild(node, expand);
        };
        expand(source);
        const next = printer.printFile(source);
        if (next === formatted) break;
        formatted = next;
        if (pass === 3) throw new Error(`Formatting did not stabilize: ${name}`);
    }
    if (original === formatted) continue;
    changed++;
    if (check) console.error(`Needs formatting: src/${name}`);
    else await writeFile(path, formatted);
}
if (check && changed) process.exitCode = 1;
else console.log(check ? 'TypeScript format check passed.' : `Formatted ${changed} TypeScript files.`);
