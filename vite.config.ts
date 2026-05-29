import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const buildSha = process.env.VERCEL_GIT_COMMIT_SHA || env.VITE_BUILD_SHA || '';
    const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || env.VITE_DEPLOYMENT_ID || '';
    const vercelEnv = process.env.VERCEL_ENV || env.VITE_VERCEL_ENV || '';
    return {
      base: '/',
      server: {
        port: 3001,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha),
        'import.meta.env.VITE_DEPLOYMENT_ID': JSON.stringify(deploymentId),
        'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(vercelEnv),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html')
          }
        },
        assetsDir: 'assets',
        outDir: 'dist'
      }
    };
});
