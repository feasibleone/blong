import react from '@vitejs/plugin-react';
import {resolve} from 'path';
import {defineConfig} from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts', 'src/**/*.tsx'],
            exclude: [
                'src/**/*.stories.tsx',
                'src/**/*.test.tsx',
                'src/**/*.test.ts',
                'src/test/**',
                'src/index.ts',
            ],
            thresholds: {
                lines: 80,
                branches: 70,
                functions: 80,
                statements: 80,
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
});
