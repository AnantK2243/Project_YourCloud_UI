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
      reportsDirectory: 'coverage/frontend',
      include: [
        'src/app/**/*.service.ts',
        'src/app/**/*.guard.ts',
        'src/app/**/*.routes.ts',
        'src/app/utils/**/*.ts'
      ],
      exclude: [
        'src/app/**/*.spec.ts',
        'src/app/**/index.ts',
        'src/**/*.d.ts'
      ],
      all: false,
      thresholds: {
        lines: 55,
        functions: 70,
        branches: 60,
        statements: 55,
      },
    },
    environmentOptions: {
      jsdom: {
        url: 'https://127.0.0.1:4200/'
      }
    }
  },
});
