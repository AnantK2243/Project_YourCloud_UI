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
		'!dist/**',
		'!src/app/**' // exclude Angular frontend
	],
	coverageDirectory: 'coverage/backend',
	coverageReporters: ['text', 'lcov', 'html'],
	clearMocks: true,
	restoreMocks: true,
	detectOpenHandles: true,
	forceExit: true,
	maxWorkers: 1
};
