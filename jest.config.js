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
	// coverageThreshold: {
	// 	global: {
	// 		branches: 40,
	// 		functions: 40,
	// 		lines: 40,
	// 		statements: 40
	// 	}
	// },
	clearMocks: true,
	restoreMocks: true,
	detectOpenHandles: true,
	forceExit: true,
	maxWorkers: 1 // Helps with database connections in tests
};
