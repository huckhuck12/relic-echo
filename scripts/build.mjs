import { rm, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 先确认锁定编译器存在，再清理固定输出目录；删除/拆分源码后不会遗留旧 JS。
const require = createRequire(import.meta.url);
const compiler = require.resolve('typescript/bin/tsc');
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status === 0) {
    const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
    const target = new URL('../dist/shared/version.js', import.meta.url);
    await writeFile(target, (await readFile(target, 'utf8')).replaceAll('__RELIC_VERSION__', version));
}
process.exitCode = result.status ?? 1;
