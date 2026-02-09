/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  // Use node environment by default — API routes and lib tests need full
  // Node globals (Request, Response, fetch, crypto, etc.).
  // Component tests opt in to jsdom via a per-file docblock:
  //   /** @jest-environment jsdom */
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
        diagnostics: {
          // Ignore TS errors when importing mock members from mapped modules
          ignoreDiagnostics: [2305, 2345],
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@hour-tracker/database$': '<rootDir>/__mocks__/@hour-tracker/database.ts',
    '^@hour-tracker/types$': '<rootDir>/../../packages/types/src',
    '^@hour-tracker/ui$': '<rootDir>/../../packages/ui/src',
  },
  setupFiles: ['<rootDir>/jest.polyfills.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/components/**/*.test.{ts,tsx}',
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/lib/**/*.{ts,tsx}',
    'src/app/api/**/*.{ts,tsx}',
    'components/ui/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
