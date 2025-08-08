module.exports = {
	testEnvironment: 'node',
	setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
	testTimeout: 15000,
	testMatch: ['**/tests/unit/**/*.test.js', '**/tests/integration/**/*.test.js'],
	testPathIgnorePatterns: [
		'/node_modules/',
		'/dist/',
		'/coverage/',
		'<rootDir>/tests/unit/routes-wiring.test.js',
		'<rootDir>/tests/unit/frontend-utils.test.js'
	],
	verbose: true,
	collectCoverageFrom: [
		'src/**/*.js',
		'!src/**/*.test.js',
		'!**/node_modules/**',
		'!coverage/**',
		'!dist/**',
		'!src/app/**'
	],
	coveragePathIgnorePatterns: ['<rootDir>/server.js'],
	coverageDirectory: 'coverage/backend',
	coverageReporters: ['text', 'lcov', 'html'],
	coverageThreshold: {
		global: {
			branches: 68,
			functions: 60,
			lines: 39,
			statements: 39
		}
	},
	coverageProvider: 'v8',
	transform: {},
	clearMocks: true,
	restoreMocks: true,
	detectOpenHandles: true,
	forceExit: true,
	maxWorkers: 1,
	moduleNameMapper: {
		'^glob$': '<rootDir>/tests/utils/glob-sync-shim.js'
	}
};
