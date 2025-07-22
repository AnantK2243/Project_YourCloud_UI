module.exports = {
	testEnvironment: 'node',
	setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
	testTimeout: 15000,
	testMatch: ['**/tests/unit/**/*.test.js', '**/tests/integration/**/*.test.js'],
	verbose: true,
	collectCoverageFrom: [
		'src/**/*.js',
		'server.js',
		'!src/**/*.test.js',
		'!**/node_modules/**',
		'!coverage/**',
		'!dist/**'
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
	coverageThreshold: {
		global: {
			branches: 43,
			functions: 45,
			lines: 44,
			statements: 44
		}
	},
	clearMocks: true,
	restoreMocks: true,
	detectOpenHandles: true,
	forceExit: true,
	maxWorkers: 1 // Helps with database connections in tests
};
