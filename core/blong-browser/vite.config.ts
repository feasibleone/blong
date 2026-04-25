import react from '@vitejs/plugin-react';
import {resolve} from 'path';
import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        react(),
        dts({
            include: ['src'],
            exclude: ['src/**/*.stories.tsx', 'src/**/*.test.tsx', 'src/**/*.test.ts'],
        }),
    ],
    build: {
        lib: {
            entry: {
                'blong-browser': resolve(__dirname, 'src/index.ts'),
                storybook: resolve(__dirname, 'src/storybook.ts'),
            },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                'react',
                'react/jsx-runtime',
                'react-dom',
                'react-hook-form',
                'primereact',
                /^primereact\//,
                'primeicons',
                /^primeicons\//,
                '@primereact/themes',
                /^@primereact\//,
                '@feasibleone/blong',
                'zustand',
                /^zustand\//,
                '@dnd-kit/core',
                '@dnd-kit/sortable',
                '@dnd-kit/utilities',
            ],
            output: {
                preserveModules: false,
                assetFileNames: 'assets/[name][extname]',
            },
        },
        sourcemap: true,
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
});
