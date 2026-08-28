import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig(({ command }) => {
  if (command === 'build' && !process.env.VITE_IDE_PORT) {
    throw new Error(
      'нет VITE_IDE_PORT: собранный фронт не знает, куда стучаться сокетом. ' +
        'Собирай через `pnpm stable:build` — он подставляет порт (ADR-0145)',
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
