// tests/unit/validation-edge-cases.test.js

const {
	validateRegistrationInput,
	validateLoginInput,
	validateNodeRegistrationInput,
	validateChunkId,
	sanitizeString
} = require('../../src/utils/validation');

describe('Validation Functions - Edge Cases', () => {
	describe('validateRegistrationInput', () => {
		test('should handle null/undefined input gracefully', () => {
			expect(validateRegistrationInput(null).valid).toBe(false);
			expect(validateRegistrationInput(undefined).valid).toBe(false);
			expect(validateRegistrationInput({}).isValid).toBe(false);
		});

		test('should validate name boundaries correctly', () => {
			// Valid name with special characters
			const validName = validateRegistrationInput({
				name: 'O\'Connor-Smith',
				email: 'test@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			});
			expect(validName.isValid).toBe(true);

			// Invalid name - too short
			const tooShort = validateRegistrationInput({
				name: 'A',
				email: 'test@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			});
			expect(tooShort.isValid).toBe(false);

			// Invalid name - only special characters
			const invalidChars = validateRegistrationInput({
				name: '!@#$%^&*()',
				email: 'test@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			});
			expect(invalidChars.isValid).toBe(false);
		});

		test('should validate password requirements', () => {
			// Password too long
			const tooLong = validateRegistrationInput({
				name: 'Test User',
				email: 'test@example.com',
				password: 'A'.repeat(129), // 129 chars
				salt: 'randomsalt123'
			});
			expect(tooLong.isValid).toBe(false);

			// Missing uppercase
			const noUppercase = validateRegistrationInput({
				name: 'Test User',
				email: 'test@example.com',
				password: 'lowercase123!',
				salt: 'randomsalt123'
			});
			expect(noUppercase.isValid).toBe(false);
		});
	});

	describe('validateLoginInput', () => {
		test('should handle malformed input', () => {
			expect(validateLoginInput(null).valid).toBe(false);
			expect(validateLoginInput({ email: 123, password: true }).isValid).toBe(false);
		});
	});

	describe('validateNodeRegistrationInput', () => {
		test('should validate node_id boundaries', () => {
			// Too short
			const tooShort = validateNodeRegistrationInput({
				node_id: 'ab',
				label: 'Test Node',
				auth_token: 'validtoken123456'
			});
			expect(tooShort.isValid).toBe(false);

			// Too long
			const tooLong = validateNodeRegistrationInput({
				node_id: 'a'.repeat(51),
				label: 'Test Node',
				auth_token: 'validtoken123456'
			});
			expect(tooLong.isValid).toBe(false);
		});
	});

	describe('validateChunkId', () => {
		test('should handle invalid UUID formats', () => {
			expect(validateChunkId('invalid-uuid')).toBe(false);
			expect(validateChunkId('')).toBe(false);
			expect(validateChunkId(null)).toBe(false);
			expect(validateChunkId(123)).toBe(false);
		});
	});

	describe('sanitizeString', () => {
		test('should handle various input types', () => {
			expect(sanitizeString(null)).toBe('');
			expect(sanitizeString(undefined)).toBe('');
			expect(sanitizeString(123)).toBe(''); // Non-string becomes empty string
			expect(sanitizeString('<script>alert("xss")</script>')).not.toContain('<script>');
		});
	});
});
