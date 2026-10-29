import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración base de Vite + React.
export default defineConfig({
  plugins: [react()],
});
