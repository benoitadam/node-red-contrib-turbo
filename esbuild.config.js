const { build } = require('esbuild');
const { readdirSync, copyFileSync, mkdirSync, cpSync } = require('node:fs');
const { join } = require('node:path');

const list = readdirSync('src');

const templates = list.filter(f => f.endsWith('.html'));

const config = {
  entryPoints: templates.map(f => join('src', f.replace('.html', '.ts'))),
  bundle: true,
  platform: 'node',
  target: 'node16',
  format: 'cjs',
  outdir: 'dist',
  external: ['pocketbase', 'node-red'],
  sourcemap: true,
  minify: false
};

// Build
build(config)
  .then(() => {
    for (const f of templates) {
      copyFileSync(join('src', f), join('dist', f));
    }
    // Copier le dossier icons
    mkdirSync(join('dist', 'icons'), { recursive: true });
    cpSync(join('src', 'icons'), join('dist', 'icons'), { recursive: true });
  })
  .catch(() => process.exit(1));