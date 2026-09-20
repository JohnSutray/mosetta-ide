import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig(({ command }) => {
  if (command === 'build' && !process.env.VITE_IDE_PORT) {
    throw new Error(
      'no VITE_IDE_PORT: a built front end does not know where to knock with its socket. ' +
        'Build through `pnpm stable:build` — it supplies the port',
    );
  }

  return {
    plugins: [preact()],
    server: {
      host: '127.0.0.1',
      port: Number(process.env.IDE_UI_PORT) || 5177,
      strictPort: true,
    },
    build: { target: 'es2022' },
  };
});
