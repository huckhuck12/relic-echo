import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const pagesRoot = resolve(projectRoot, '_site');

/** 构建可独立托管的纯静态目录；入口和所有模块都使用相对 URL，无需写死仓库名。
 * 输出路径固定在项目 _site，仅清理这个生成目录，不接受外部传入的删除目标。
 */
export async function buildPages() {
    const entry = await readFile(join(projectRoot, 'index.html'), 'utf8');
    // 保留编译目录层级；功能分目录后不能只收集 dist 根目录的入口。
    async function collect(root, prefix = '') {
        const files = [];
        for (const entry of await readdir(root, { withFileTypes: true })) {
            const name = prefix + entry.name;
            if (entry.isDirectory()) files.push(...await collect(join(root, entry.name), name + '/'));
            else if (extname(name) === '.js') files.push(name);
        }
        return files;
    }
    const scripts = await collect(join(projectRoot, 'dist'));
    if (!scripts.includes('main.js')) throw new Error('Missing dist/main.js; run npm run build first.');
    for (const name of ['laya.core.js', 'laya.webgl.js']) await readFile(join(projectRoot, 'vendor', name));
    await rm(pagesRoot, { recursive: true, force: true });
    await mkdir(join(pagesRoot, 'dist'), { recursive: true });
    await cp(join(projectRoot, 'vendor'), join(pagesRoot, 'vendor'), { recursive: true });
    await writeFile(join(pagesRoot, 'index.html'), entry);
    await writeFile(join(pagesRoot, '.nojekyll'), '');
    for (const name of scripts) {
        const source = await readFile(join(projectRoot, 'dist', name), 'utf8');
        await mkdir(join(pagesRoot, 'dist', name, '..'), { recursive: true });
        // 发布包不依赖工作区源码和 source map，避免开发者工具请求未发布的映射文件。
        await writeFile(join(pagesRoot, 'dist', name), source.replace(/^\/\/# sourceMappingURL=.*(?:\r?\n)?/gm, ''));
    }
    return { root: pagesRoot, modules: scripts.length };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    const result = await buildPages();
    console.log(`GitHub Pages ready: ${result.root} (${result.modules} modules).`);
}
