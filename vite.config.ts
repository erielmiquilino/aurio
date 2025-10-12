import { defineConfig } from 'vite';
// @ts-ignore
import { resolve } from 'path';
// @ts-ignore
import { copyFile } from 'fs/promises';
// @ts-ignore
import { fileURLToPath } from 'url';

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
          try {
            await copyFile(src, dst);
          } catch (_) {
            // ignore
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
          options: resolve(rootDir, 'src/options/index.html')
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


