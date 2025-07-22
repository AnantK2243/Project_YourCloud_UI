// tests/unit/validation.test.js

const {
	validateRegistrationInput,
	validateLoginInput,
	validateNodeRegistrationInput: _validateNodeRegistrationInput,
	validateChunkId,
	sanitizeString
} = require('../../src/utils/validation');

describe('Validation Functions', () => {
	describe('validateRegistrationInput', () => {
		test('should validate valid registration data', () => {
			const validData = {
				name: 'John Doe',
				email: 'john@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(validData);
			expect(result.isValid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test('should reject invalid email', () => {
			const invalidData = {
				name: 'John Doe',
				email: 'invalid-email',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(invalidData);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Email format is invalid');
		});

		test('should reject weak password', () => {
			const invalidData = {
				name: 'John Doe',
				email: 'john@example.com',
				password: 'weak',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(invalidData);
			expect(result.isValid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe('validateLoginInput', () => {
		test('should validate valid login data', () => {
			const validData = {
				email: 'john@example.com',
				password: 'password123'
			};

			const result = validateLoginInput(validData);
			expect(result.isValid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test('should reject missing email', () => {
			const invalidData = {
				password: 'password123'
			};

			const result = validateLoginInput(invalidData);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Email is required and must be a string');
		});
	});

	describe('validateChunkId', () => {
		test('should validate valid UUID v4', () => {
			const validUuid = '550e8400-e29b-41d4-a716-446655440000';
			expect(validateChunkId(validUuid)).toBe(true);
		});

		test('should reject invalid UUID', () => {
			expect(validateChunkId('invalid-uuid')).toBe(false);
			expect(validateChunkId('')).toBe(false);
			expect(validateChunkId(null)).toBe(false);
		});
	});

	describe('validateNodeRegistrationInput', () => {
		test('should validate valid node registration data', () => {
			const validData = {
				node_id: 'test-node-123',
				label: 'Test Storage Node',
				auth_token: 'validauthtoken123456'
			};

			const result = _validateNodeRegistrationInput(validData);
			expect(result.isValid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test('should reject missing label', () => {
			const invalidData = {
				node_id: 'test-node-123',
				auth_token: 'validauthtoken123456'
			};

			const result = _validateNodeRegistrationInput(invalidData);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Label is required and must be a string');
		});

		test('should reject short auth token', () => {
			const invalidData = {
				node_id: 'test-node-123',
				label: 'Test Node',
				auth_token: 'short'
			};

			const result = _validateNodeRegistrationInput(invalidData);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Auth token is too short');
		});
	});

	describe('sanitizeString', () => {
		test('should escape HTML characters', () => {
			const input = '<div>Hello</div>';
			const result = sanitizeString(input);
			expect(result).toContain('&lt;');
			expect(result).toContain('&gt;');
		});

		test('should remove javascript protocol', () => {
			const input = 'javascript:alert("xss")';
			const result = sanitizeString(input);
			expect(result).not.toContain('javascript:');
		});

		test('should handle non-string input', () => {
			expect(sanitizeString(123)).toBe('');
			expect(sanitizeString({})).toBe('');
			expect(sanitizeString([])).toBe('');
		});

		test('should handle null/undefined inputs', () => {
			expect(sanitizeString(null)).toBe('');
			expect(sanitizeString(undefined)).toBe('');
			expect(sanitizeString('')).toBe('');
		});
	});
});
