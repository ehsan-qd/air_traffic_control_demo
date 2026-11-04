import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const backend = process.env.NAT_BACKEND ?? '127.0.0.1:8765';
const hosted = process.env.NAT_HOSTED_BUILD === '1';

export default defineConfig({
  plugins: [react()],
  base: hosted ? '/nats/' : '/',
  build: hosted ? {
    outDir: path.resolve(__dirname, '../public/nats'),
    emptyOutDir: true,
    copyPublicDir: false,
  } : undefined,
  publicDir: path.resolve(__dirname, '../public'),
  server: { port: Number(process.env.WEB_PORT ?? 5173), strictPort: true, proxy: { '/api': `http://${backend}`, '/ws': { target: `ws://${backend}`, ws: true } } },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['./src/test-setup.ts'] },
});

