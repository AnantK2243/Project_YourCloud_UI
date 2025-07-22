// jest.frontend.config.js - Configuration for frontend tests

module.exports = {
	displayName: 'Frontend Tests',
	testMatch: ['**/tests/frontend/**/*.test.{js,ts}'],
	testEnvironment: 'jsdom',
	setupFilesAfterEnv: ['<rootDir>/tests/frontend-setup.js'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	preset: 'ts-jest',
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				tsconfig: {
					module: 'commonjs',
					target: 'es2017',
					moduleResolution: 'node',
					experimentalDecorators: true,
					emitDecoratorMetadata: true,
					skipLibCheck: true,
					lib: ['es2017', 'dom']
				}
			}
		],
		'^.+\\.(js|jsx)$': 'babel-jest'
	},
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^@app/(.*)$': '<rootDir>/src/app/$1'
	},
	collectCoverageFrom: [
		'src/app/**/*.ts',
		'!src/app/**/*.spec.ts',
		'!src/app/**/*.d.ts',
		'!src/main.ts',
		'!src/main.server.ts',
		'!src/app/**/*.routes.ts'
	],
	coverageDirectory: 'coverage/frontend',
	coverageReporters: ['text', 'lcov', 'html'],
	coverageThreshold: {
		global: {
			branches: 50,
			functions: 50,
			lines: 50,
			statements: 50
		}
	},
	verbose: true,
	testTimeout: 10000,
	clearMocks: true,
	restoreMocks: true
};
