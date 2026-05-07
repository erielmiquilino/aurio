import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { build as esbuild } from 'esbuild';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  return {
    plugins: [
      {
        name: 'copy-manifest',
        apply: 'build',
        closeBundle: async () => {
          const src = resolve(rootDir, 'manifest.json');
          const dst = resolve(rootDir, 'dist/manifest.json');
          await mkdir(resolve(rootDir, 'dist'), { recursive: true });
          try {
            await copyFile(src, dst);
          } catch (_) {
            // ignore
          }
          // Copiar pdf.worker
          const pdfWorkerSrc = resolve(rootDir, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
          const pdfWorkerDst = resolve(rootDir, 'dist/pdf.worker.min.mjs');
          try {
            await copyFile(pdfWorkerSrc, pdfWorkerDst);
            console.log('✓ pdf.worker.min.mjs copiado');
          } catch (e) {
            console.error('✗ Falha ao copiar pdf.worker.min.mjs', e);
          }
          // Content scripts não podem usar import/export no Chrome.
          // O bundle principal do Vite pode gerar imports compartilhados; sobrescrever
          // content.js com um IIFE autocontido evita "Cannot use import statement outside a module".
          try {
            await esbuild({
              entryPoints: [resolve(rootDir, 'src/content/index.ts')],
              bundle: true,
              format: 'iife',
              target: 'es2020',
              outfile: resolve(rootDir, 'dist/content.js'),
              sourcemap: isDev,
              minify: !isDev,
              logLevel: 'silent'
            });
            console.log('✓ content.js empacotado como script clássico');
          } catch (e) {
            console.error('✗ Falha ao empacotar content.js', e);
            throw e;
          }
        }
      }
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2020',
      sourcemap: isDev ? true : false,
      minify: isDev ? false : 'esbuild',
      rollupOptions: {
      input: {
        background: resolve(rootDir, 'src/background/serviceWorker.ts'),
        content: resolve(rootDir, 'src/content/index.ts'),
        popup: resolve(rootDir, 'src/popup/index.html'),
        options: resolve(rootDir, 'src/options/index.html'),
        offscreen: resolve(rootDir, 'src/offscreen/index.html'),
        styles: resolve(rootDir, 'src/styles/global.css')
      },
        output: {
          entryFileNames: (chunk) => {
            if (chunk.name === 'background') return 'background.js';
            if (chunk.name === 'content') return 'content.js';
            return '[name].js';
          },
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: (asset) => {
            if (asset.name === 'index.css') return 'styles.css';
            return '[name][extname]';
          }
        }
      }
    }
  };
});


