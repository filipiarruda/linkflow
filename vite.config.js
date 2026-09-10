import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                popup: new URL('popup.html', import.meta.url).pathname,
                dashboard: new URL('dashboard.html', import.meta.url).pathname,
                content: new URL('src/linkedin/content.ts', import.meta.url).pathname,
            },
            output: {
                entryFileNames: function (chunk) { return chunk.name === 'content' ? 'content.js' : 'assets/[name]-[hash].js'; },
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]',
            },
        },
    },
});
