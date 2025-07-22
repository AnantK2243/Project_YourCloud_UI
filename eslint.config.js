const js = require('@eslint/js');

module.exports = [
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'commonjs',
			globals: {
				// Node.js globals
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				exports: 'writable',
				module: 'writable',
				require: 'readonly',
				global: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				// Jest globals
				describe: 'readonly',
				it: 'readonly',
				test: 'readonly',
				expect: 'readonly',
				beforeAll: 'readonly',
				afterAll: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
				jest: 'readonly'
			}
		},
		rules: {
			indent: [
				'error',
				'tab',
				{
					SwitchCase: 1,
					MemberExpression: 1
				}
			],
			'linebreak-style': ['error', 'unix'],
			quotes: ['error', 'single', { allowTemplateLiterals: true }],
			semi: ['error', 'always'],
			'no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_'
				}
			],
			'no-console': 'off',
			'no-process-exit': 'off',
			'no-async-promise-executor': 'warn',
			'comma-dangle': ['error', 'never'],
			'object-curly-spacing': ['error', 'always'],
			'array-bracket-spacing': ['error', 'never'],
			'prefer-const': 'error',
			'no-var': 'error',
			eqeqeq: ['error', 'always'],
			curly: ['error', 'all'],
			'brace-style': ['error', '1tbs'],
			'max-len': ['warn', { code: 100, ignoreStrings: true, ignoreComments: true }],
			'no-trailing-spaces': 'error',
			'eol-last': 'error'
		},
		files: ['**/*.js'],
		ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'build/**', '*.min.js']
	}
];
