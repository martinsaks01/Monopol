import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' gjør at bygget fungerer både på GitHub Pages og fra en vilkårlig mappe.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 4000 },
});
