// tests/unit/validation-branches.test.js

const {
	validateRegistrationInput,
	validateLoginInput,
	validateNodeRegistrationInput
} = require('../../src/utils/validation');

describe('Validation Functions - Additional Branch Coverage', () => {
	describe('validateRegistrationInput', () => {
		test('should flag email too long when format is otherwise valid', () => {
			const veryLongDomain = `${'a'.repeat(30)}.${'b'.repeat(30)}.${'c'.repeat(30)}.com`;
			const email = `user@${veryLongDomain}`; // total length > 100 but RFC-valid
			const data = {
				name: 'John Doe',
				email,
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};
			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Email is too long');
		});

		test('should require salt to be a string', () => {
			const data = {
				name: 'John Doe',
				email: 'john@example.com',
				password: 'StrongPass123'
				// salt missing
			};
			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Salt is required and must be a string');
		});

		test('should handle missing email branch', () => {
			const data = {
				name: 'John Doe',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};
			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Email is required and must be a string');
		});

		test('should handle missing password branch', () => {
			const data = {
				name: 'John Doe',
				email: 'john@example.com',
				salt: 'randomsalt123'
			};
			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Password is required and must be a string');
		});

		test('should handle non-string salt branch', () => {
			const data = {
				name: 'John Doe',
				email: 'john@example.com',
				password: 'StrongPass123',
				salt: 12345
			};
			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Salt is required and must be a string');
		});

		// Newly added tests for missed branches
		test('should handle missing name branch', () => {
			const data = {
				email: 'john@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};
			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Name is required and must be a string');
		});

		test('should handle non-string name branch', () => {
			const data = {
				name: 123,
				email: 'john@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};
			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Name is required and must be a string');
		});

		test('should reject name longer than 50 characters', () => {
			const data = {
				name: 'a'.repeat(51),
				email: 'john@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};
			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Name must be between 2 and 50 characters');
		});

		test('should handle non-string email in registration', () => {
			const data = {
				name: 'John Doe',
				email: 42,
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};
			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Email is required and must be a string');
		});

		test('should handle non-string password branch', () => {
			const data = {
				name: 'John Doe',
				email: 'john@example.com',
				password: 999,
				salt: 'randomsalt123'
			};
			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Password is required and must be a string');
		});
	});

	describe('validateLoginInput', () => {
		test('should reject invalid email format', () => {
			const data = { email: 'not-an-email', password: 'password123' };
			const result = validateLoginInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Email format is invalid');
		});

		test('should reject missing password branch', () => {
			const data = { email: 'john@example.com' };
			const result = validateLoginInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Password is required and must be a string');
		});

		test('should reject non-string password branch', () => {
			const data = { email: 'john@example.com', password: 12345 };
			const result = validateLoginInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Password is required and must be a string');
		});
	});

	describe('validateNodeRegistrationInput', () => {
		test('should reject node_id with invalid characters', () => {
			const data = { node_id: 'bad*id', label: 'My Node', auth_token: 'validtoken123456' };
			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Node ID contains invalid characters');
		});

		test('should reject label that is too long', () => {
			const data = {
				node_id: 'good-id',
				label: 'a'.repeat(101),
				auth_token: 'validtoken123456'
			};
			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Label must be between 1 and 100 characters');
		});

		test('should handle missing auth_token branch', () => {
			const data = { node_id: 'good-id', label: 'Node Label' };
			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Auth token is required and must be a string');
		});

		test('should handle missing node_id branch', () => {
			const data = { label: 'Node Label', auth_token: 'validtoken123456' };
			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Node ID is required and must be a string');
		});

		test('should handle non-object input branch', () => {
			const result = validateNodeRegistrationInput(null);
			expect(result.valid).toBe(false);
			expect(Array.isArray(result.errors)).toBe(true);
		});

		// Newly added tests for missed branches
		test('should reject empty label (length < 1)', () => {
			const data = { node_id: 'good-id', label: '', auth_token: 'validtoken123456' };
			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			// Empty string is falsy, so validator treats it as missing/non-string
			expect(result.errors).toContain('Label is required and must be a string');
		});

		test('should reject non-string label', () => {
			const data = { node_id: 'good-id', label: 123, auth_token: 'validtoken123456' };
			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Label is required and must be a string');
		});

		test('should reject non-string auth_token', () => {
			const data = { node_id: 'good-id', label: 'Node Label', auth_token: 98765 };
			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Auth token is required and must be a string');
		});
	});
});
