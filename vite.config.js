import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit()
  ],
  optimizeDeps: {
    exclude: ['manifold-3d']
  },
  worker: {
    format: 'es'
  },
  build: {
    target: 'esnext'
  }
});
