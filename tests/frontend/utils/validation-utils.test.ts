// tests/frontend/utils/validation-utils.test.ts

/**
 * Validation utilities tests
 * Testing the actual validation functions from the TypeScript source
 */

import {
	validateEmail,
	validatePasswordStrength,
	validateName,
	isValidEmail,
	isStrongPassword,
	isValidName,
	ValidationResult
} from '../../../src/app/utils/validation-utils';

describe('Validation Utils', () => {
	describe('Email Validation', () => {
		describe('validateEmail function', () => {
			test('should validate correct email addresses', () => {
				const validEmails = [
					'test@example.com',
					'user.name@domain.org',
					'admin@company.co.uk',
					'user+tag@example.com',
					'firstname.lastname@domain.co.uk'
				];

				validEmails.forEach(email => {
					const result = validateEmail(email);
					expect(result.isValid).toBe(true);
					expect(result.message).toBeUndefined();
				});
			});

			test('should reject invalid email addresses', () => {
				const invalidEmails = [
					{ email: '', expectedMessage: 'Email is required' },
					{ email: '   ', expectedMessage: 'Email is required' },
					{ email: 'notanemail', expectedMessage: 'Please enter a valid email address' },
					{
						email: '@example.com',
						expectedMessage: 'Please enter a valid email address'
					},
					{ email: 'test@', expectedMessage: 'Please enter a valid email address' },
					{
						email: 'test.example.com',
						expectedMessage: 'Please enter a valid email address'
					}
				];

				invalidEmails.forEach(({ email, expectedMessage }) => {
					const result = validateEmail(email);
					expect(result.isValid).toBe(false);
					expect(result.message).toBe(expectedMessage);
				});
			});

			test('should reject emails that are too long', () => {
				const longEmail = 'a'.repeat(250) + '@example.com';
				const result = validateEmail(longEmail);
				expect(result.isValid).toBe(false);
				expect(result.message).toBe('Email is too long (max 254 characters)');
			});

			test('should handle null and undefined inputs', () => {
				const result1 = validateEmail(null as any);
				expect(result1.isValid).toBe(false);
				expect(result1.message).toBe('Email is required');

				const result2 = validateEmail(undefined as any);
				expect(result2.isValid).toBe(false);
				expect(result2.message).toBe('Email is required');
			});
		});

		describe('isValidEmail function', () => {
			test('should return boolean for valid emails', () => {
				expect(isValidEmail('test@example.com')).toBe(true);
				expect(isValidEmail('invalid-email')).toBe(false);
				expect(isValidEmail('')).toBe(false);
			});
		});
	});

	describe('Password Strength Validation', () => {
		describe('validatePasswordStrength function', () => {
			test('should accept strong passwords', () => {
				const strongPasswords = [
					'Password123!',
					'MySecure@Pass456',
					'Strong#Password2024',
					'Complex$Pass789'
				];

				strongPasswords.forEach(password => {
					const result = validatePasswordStrength(password);
					expect(result.isValid).toBe(true);
					expect(result.message).toBeUndefined();
				});
			});

			test('should reject passwords without minimum length', () => {
				const shortPasswords = ['Pass1!', 'Ab1!', ''];

				shortPasswords.forEach(password => {
					const result = validatePasswordStrength(password);
					expect(result.isValid).toBe(false);
					if (password === '') {
						expect(result.message).toBe('Password is required');
					} else {
						expect(result.message).toBe('Password must be at least 8 characters long');
					}
				});
			});

			test('should reject passwords without uppercase letters', () => {
				const result = validatePasswordStrength('password123!');
				expect(result.isValid).toBe(false);
				expect(result.message).toBe('Password must contain at least one uppercase letter');
			});

			test('should reject passwords without lowercase letters', () => {
				const result = validatePasswordStrength('PASSWORD123!');
				expect(result.isValid).toBe(false);
				expect(result.message).toBe('Password must contain at least one lowercase letter');
			});

			test('should reject passwords without numbers', () => {
				const result = validatePasswordStrength('Password!');
				expect(result.isValid).toBe(false);
				expect(result.message).toBe('Password must contain at least one number');
			});

			test('should reject passwords without special characters', () => {
				const result = validatePasswordStrength('Password123');
				expect(result.isValid).toBe(false);
				expect(result.message).toBe('Password must contain at least one special character');
			});

			test('should handle whitespace-only passwords', () => {
				const result = validatePasswordStrength('   ');
				expect(result.isValid).toBe(false);
				expect(result.message).toBe('Password is required');
			});
		});

		describe('isStrongPassword function', () => {
			test('should return boolean for password strength', () => {
				expect(isStrongPassword('Password123!')).toBe(true);
				expect(isStrongPassword('weak')).toBe(false);
				expect(isStrongPassword('')).toBe(false);
			});
		});
	});

	describe('Name Validation', () => {
		describe('validateName function', () => {
			test('should accept valid names', () => {
				const validNames = [
					'John',
					'Mary Smith',
					"O'Connor",
					'Jean-Pierre',
					'María García',
					'李小明'
				];

				validNames.forEach(name => {
					const result = validateName(name);
					expect(result.isValid).toBe(true);
					expect(result.message).toBeUndefined();
				});
			});

			test('should reject empty or whitespace-only names', () => {
				const emptyNames = ['', '   ', '\t\n'];

				emptyNames.forEach(name => {
					const result = validateName(name);
					expect(result.isValid).toBe(false);
					expect(result.message).toBe('Name is required');
				});
			});

			test('should reject names that are too short', () => {
				const result = validateName('A');
				expect(result.isValid).toBe(false);
				expect(result.message).toBe('Name must be at least 2 characters long');
			});

			test('should reject names that are too long', () => {
				const longName = 'A'.repeat(101);
				const result = validateName(longName);
				expect(result.isValid).toBe(false);
				expect(result.message).toBe('Name is too long (max 100 characters)');
			});

			test('should reject names with invalid characters', () => {
				const invalidNames = ['John123', 'Mary@Smith', 'Test<script>'];

				invalidNames.forEach(name => {
					const result = validateName(name);
					expect(result.isValid).toBe(false);
					expect(result.message).toBe('Name contains invalid characters');
				});
			});

			test('should handle null and undefined inputs', () => {
				const result1 = validateName(null as any);
				expect(result1.isValid).toBe(false);
				expect(result1.message).toBe('Name is required');

				const result2 = validateName(undefined as any);
				expect(result2.isValid).toBe(false);
				expect(result2.message).toBe('Name is required');
			});
		});

		describe('isValidName function', () => {
			test('should return boolean for name validation', () => {
				expect(isValidName('John Doe')).toBe(true);
				expect(isValidName('A')).toBe(false);
				expect(isValidName('')).toBe(false);
			});
		});
	});

	describe('ValidationResult Interface', () => {
		test('should return proper ValidationResult structure', () => {
			const validResult = validateEmail('test@example.com');
			expect('isValid' in validResult).toBe(true);
			expect(typeof validResult.isValid).toBe('boolean');
			expect(validResult.isValid).toBe(true);

			const invalidResult = validateEmail('invalid');
			expect('isValid' in invalidResult).toBe(true);
			expect('message' in invalidResult).toBe(true);
			expect(typeof invalidResult.isValid).toBe('boolean');
			expect(typeof invalidResult.message).toBe('string');
			expect(invalidResult.isValid).toBe(false);
		});
	});
});
