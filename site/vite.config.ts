import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: { host: '127.0.0.1', port: Number(process.env.SITE_PORT) || 5190, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: 'index.html', play: 'play/index.html' } },
  },
});
