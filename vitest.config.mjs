import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/vitest.setup.ts'],
    include: [
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx'
    ],
    exclude: [
      'tests/**',
      'node_modules/**',
      'dist/**'
    ],
    server: {
      deps: {
        inline: [/@angular\//, /zone\.js/]
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage/frontend'
    },
    environmentOptions: {
      jsdom: {
        url: 'https://127.0.0.1:4200/'
      }
    }
  },
});
