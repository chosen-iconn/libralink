import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const watch = process.argv.includes('--dev');
const result = await build({
  entryPoints: [path.join(here, 'src/main.jsx')],
  bundle: true, minify: !watch, sourcemap: watch, outdir: dist, entryNames: 'app-[hash]',
  jsx: 'automatic', target: 'es2020', loader: { '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [],
  metafile: true, logLevel: 'info',
});
const outs = Object.keys(result.metafile.outputs).map(f => path.basename(f));
const js = outs.find(f => f.endsWith('.js')), css = outs.find(f => f.endsWith('.css'));
let html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
html = html.replace('/app.css', '/' + css).replace('/app.js', '/' + js);
fs.writeFileSync(path.join(dist, 'index.html'), html);
console.log(`Built ${js} (${(fs.statSync(path.join(dist, js)).size / 1024).toFixed(0)} KB) and ${css}`);
