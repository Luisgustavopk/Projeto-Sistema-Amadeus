import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const port = Number(process.env.AMADEUS_WEB_PORT ?? 4176);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Porta inválida.');
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port, strictPort: true },
  preview: { host: '127.0.0.1', port, strictPort: true },
  build: { target: 'es2022' },
});
