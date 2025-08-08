// tests/unit/frontend-utils.test.js

// This test suite lightly validates typed TS util exports via transpiled requires.
// Jest runs in Node, so we simply require the built-in TS loader behavior used by Jest for CJS.

const path = require('path');

// Helper to require TS file through ts-node/register or transpile on the fly if needed.
// Our project already uses plain JS for backend; this test only checks exported runtime shapes.

describe('Frontend utility modules (basic shape checks)', () => {
	test('file-utils exports expected helpers', () => {
		const fileUtils = require(path.resolve('src/app/utils/file-utils.ts'));
		expect(typeof fileUtils.joinPath).toBe('function');
		expect(typeof fileUtils.getFileName).toBe('function');
		expect(typeof fileUtils.validateFileName).toBe('function');
	});

	test('component-utils exports expected helpers', () => {
		const compUtils = require(path.resolve('src/app/utils/component-utils.ts'));
		expect(typeof compUtils.getFieldErrors).toBe('function');
		expect(typeof compUtils.isFormValid).toBe('function');
	});
});
