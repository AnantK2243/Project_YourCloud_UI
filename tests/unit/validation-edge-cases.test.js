// tests/unit/validation-edge-cases.test.js

const {
	validateRegistrationInput,
	validateLoginInput,
	validateNodeRegistrationInput,
	validateChunkId,
	sanitizeString
} = require('../../src/utils/validation');

describe('Validation Functions - Edge Cases', () => {
	describe('validateRegistrationInput - Edge Cases', () => {
		test('should reject null/undefined input', () => {
			const nullResult = validateRegistrationInput(null);
			expect(nullResult.valid).toBe(false);
			expect(nullResult.errors.length).toBeGreaterThan(0);

			const undefinedResult = validateRegistrationInput(undefined);
			expect(undefinedResult.valid).toBe(false);
			expect(undefinedResult.errors.length).toBeGreaterThan(0);

			const emptyResult = validateRegistrationInput({});
			expect(emptyResult.isValid).toBe(false);
			expect(emptyResult.errors.length).toBeGreaterThan(0);
		});

		test('should reject name with only special characters', () => {
			const data = {
				name: '!@#$%^&*()',
				email: 'test@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Name contains invalid characters');
		});

		test('should accept name with apostrophes and hyphens', () => {
			const data = {
				name: 'O\'Connor-Smith',
				email: 'test@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(true);
		});

		test('should reject name that is too short', () => {
			const data = {
				name: 'A',
				email: 'test@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Name must be between 2 and 50 characters');
		});

		test('should reject name that is too long', () => {
			const data = {
				name: 'A'.repeat(51),
				email: 'test@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Name must be between 2 and 50 characters');
		});

		test('should reject email that is too long', () => {
			const data = {
				name: 'Test User',
				email: 'a'.repeat(90) + '@example.com', // 101 chars total
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			// Since it's over 100 chars, it should fail email validation first
			expect(
				result.errors.some(
					error =>
						error.includes('Email is too long') ||
						error.includes('Email format is invalid')
				)
			).toBe(true);
		});

		test('should reject password that is too long', () => {
			const data = {
				name: 'Test User',
				email: 'test@example.com',
				password: 'StrongPass123' + 'A'.repeat(120), // > 128 chars
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Password is too long');
		});

		test('should reject password without uppercase', () => {
			const data = {
				name: 'Test User',
				email: 'test@example.com',
				password: 'strongpass123',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain(
				'Password must contain at least one lowercase, uppercase, and numeric character'
			);
		});

		test('should reject password without lowercase', () => {
			const data = {
				name: 'Test User',
				email: 'test@example.com',
				password: 'STRONGPASS123',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain(
				'Password must contain at least one lowercase, uppercase, and numeric character'
			);
		});

		test('should reject password without numbers', () => {
			const data = {
				name: 'Test User',
				email: 'test@example.com',
				password: 'StrongPassword',
				salt: 'randomsalt123'
			};

			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain(
				'Password must contain at least one lowercase, uppercase, and numeric character'
			);
		});

		test('should handle non-string data types', () => {
			const data = {
				name: 123,
				email: true,
				password: [],
				salt: {}
			};

			const result = validateRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe('validateLoginInput - Edge Cases', () => {
		test('should handle null/undefined input', () => {
			const nullResult = validateLoginInput(null);
			expect(nullResult.valid).toBe(false);
			expect(nullResult.errors.length).toBeGreaterThan(0);

			const undefinedResult = validateLoginInput(undefined);
			expect(undefinedResult.valid).toBe(false);
			expect(undefinedResult.errors.length).toBeGreaterThan(0);

			const emptyResult = validateLoginInput({});
			expect(emptyResult.isValid).toBe(false);
			expect(emptyResult.errors.length).toBeGreaterThan(0);
		});

		test('should handle non-string data types', () => {
			const data = {
				email: 123,
				password: true
			};

			const result = validateLoginInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Email is required and must be a string');
			expect(result.errors).toContain('Password is required and must be a string');
		});

		test('should validate various email formats', () => {
			const validEmails = [
				'test@example.com',
				'user.name@example.com',
				'user+tag@example.com',
				'user123@example-domain.com'
			];

			validEmails.forEach(email => {
				const result = validateLoginInput({ email, password: 'password' });
				expect(result.isValid).toBe(true);
			});
		});

		test('should reject invalid email formats', () => {
			const invalidEmails = [
				'plainaddress',
				'@missingusername.com',
				'username@.com',
				'username@com',
				'username..double.dot@example.com'
			];

			invalidEmails.forEach(email => {
				const result = validateLoginInput({ email, password: 'password' });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain('Email format is invalid');
			});
		});
	});

	describe('validateNodeRegistrationInput - Edge Cases', () => {
		test('should handle null/undefined input', () => {
			const nullResult = validateNodeRegistrationInput(null);
			expect(nullResult.valid).toBe(false);
			expect(nullResult.errors.length).toBeGreaterThan(0);

			const undefinedResult = validateNodeRegistrationInput(undefined);
			expect(undefinedResult.valid).toBe(false);
			expect(undefinedResult.errors.length).toBeGreaterThan(0);

			const emptyResult = validateNodeRegistrationInput({});
			expect(emptyResult.isValid).toBe(false);
			expect(emptyResult.errors.length).toBeGreaterThan(0);
		});

		test('should reject node_id with invalid characters', () => {
			const data = {
				node_id: 'node@#$%',
				label: 'Test Node',
				auth_token: 'valid-token-123'
			};

			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Node ID contains invalid characters');
		});

		test('should accept node_id with valid characters', () => {
			const data = {
				node_id: 'node-123_test',
				label: 'Test Node',
				auth_token: 'valid-token-123456'
			};

			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(true);
		});

		test('should reject node_id that is too short', () => {
			const data = {
				node_id: 'ab',
				label: 'Test Node',
				auth_token: 'valid-token-123'
			};

			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Node ID must be between 3 and 50 characters');
		});

		test('should reject node_id that is too long', () => {
			const data = {
				node_id: 'a'.repeat(51),
				label: 'Test Node',
				auth_token: 'valid-token-123'
			};

			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Node ID must be between 3 and 50 characters');
		});

		test('should reject auth_token that is too short', () => {
			const data = {
				node_id: 'valid-node-123',
				label: 'Test Node',
				auth_token: 'short'
			};

			const result = validateNodeRegistrationInput(data);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Auth token is too short');
		});
	});

	describe('validateChunkId - Edge Cases', () => {
		test('should handle null/undefined input', () => {
			expect(validateChunkId(null)).toBe(false);
			expect(validateChunkId(undefined)).toBe(false);
			expect(validateChunkId('')).toBe(false);
		});

		test('should handle non-string input', () => {
			expect(validateChunkId(123)).toBe(false);
			expect(validateChunkId({})).toBe(false);
			expect(validateChunkId([])).toBe(false);
			expect(validateChunkId(true)).toBe(false);
		});

		test('should validate various UUID v4 formats', () => {
			const validUUIDs = [
				'550e8400-e29b-41d4-a716-446655440000',
				'f47ac10b-58cc-4372-a567-0e02b2c3d479',
				'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE'
			];

			validUUIDs.forEach(uuid => {
				expect(validateChunkId(uuid)).toBe(true);
			});
		});

		test('should reject invalid UUID formats', () => {
			const invalidUUIDs = [
				'550e8400-e29b-31d4-a716-446655440000', // Wrong version (3 instead of 4)
				'550e8400-e29b-41d4-f716-446655440000', // Wrong variant (f instead of 8-b)
				'550e8400-e29b-41d4-a716-44665544000', // Too short
				'550e8400-e29b-41d4-a716-4466554400000', // Too long
				'550e8400-e29b-41d4-a716-446655440g00', // Invalid character
				'550e8400e29b41d4a716446655440000', // Missing hyphens
				'550e8400-e29b-41d4-a716' // Incomplete
			];

			invalidUUIDs.forEach(uuid => {
				expect(validateChunkId(uuid)).toBe(false);
			});
		});
	});

	describe('sanitizeString - Edge Cases', () => {
		test('should handle various data types', () => {
			expect(sanitizeString(null)).toBe('');
			expect(sanitizeString(undefined)).toBe('');
			expect(sanitizeString(123)).toBe('');
			expect(sanitizeString({})).toBe('');
			expect(sanitizeString([])).toBe('');
			expect(sanitizeString(true)).toBe('');
		});

		test('should handle empty and whitespace strings', () => {
			expect(sanitizeString('')).toBe('');
			expect(sanitizeString('   ')).toBe('   ');
			expect(sanitizeString('\t\n')).toBe('\t\n');
		});

		test('should escape basic HTML characters', () => {
			const input = '<div>Hello</div>';
			const result = sanitizeString(input);
			expect(result).toContain('&lt;');
			expect(result).toContain('&gt;');
		});

		test('should preserve safe text content', () => {
			const safeInputs = [
				'Hello World',
				'User Name 123',
				'email@example.com',
				'This is a normal sentence.',
				'Numbers: 12345'
			];

			safeInputs.forEach(input => {
				const result = sanitizeString(input);
				expect(result).toBe(input);
			});
		});
	});
});
