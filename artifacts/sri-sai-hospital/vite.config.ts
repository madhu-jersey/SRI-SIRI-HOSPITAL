import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT || '5173';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';

// .env.local lives at the repository root, next to vercel.json.
const envDir = path.resolve(import.meta.dirname, '..', '..');

// Runs the /api/app router inside the dev server, so `pnpm dev` works without
// the Vercel CLI. Without Supabase settings it uses the in-memory demo store.
function devApi(): Plugin {
  return {
    name: 'sri-siri-dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, envDir, '');
      for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
      server.middlewares.use('/api/app', async (request, response) => {
        try {
          const module = await server.ssrLoadModule('/api/app.mjs');
          await module.default(request, response);
        } catch (error) {
          server.config.logger.error(String((error as Error).stack ?? error));
          response.statusCode = 500;
          response.end(JSON.stringify({ error: 'Dev API crashed. See the terminal.' }));
        }
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  envDir,
  plugins: [
    devApi(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
