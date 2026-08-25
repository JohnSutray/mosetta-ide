import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.IDE_UI_PORT) || 5177,
    strictPort: true,
  },
  build: { target: 'es2022' },
});
