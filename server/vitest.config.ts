import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './tests/test-db';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    env: { DATABASE_URL: TEST_DATABASE_URL, JWT_SECRET: 'test-secret' },
    fileParallelism: false,
  },
});