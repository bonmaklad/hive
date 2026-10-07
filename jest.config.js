const nextJest = require('next/jest');

module.exports = nextJest({ dir: './' })({
    testEnvironment: 'node',
    clearMocks: true,
    moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
    modulePathIgnorePatterns: ['<rootDir>/.next/'],
    testMatch: ['<rootDir>/__tests__/**/*.test.[jt]s?(x)']
});
