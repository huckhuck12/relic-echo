import { rm } from 'node:fs/promises';
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
process.exitCode = result.status ?? 1;
