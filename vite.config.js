import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' -> works under igricart.github.io/spraywall/ without hardcoding the repo name
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { include: ['src/**/*.test.js'] },
});
