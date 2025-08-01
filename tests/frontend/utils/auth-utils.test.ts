// tests/frontend/utils/auth-utils.test.ts

import {
	setToken,
	getToken,
	clearToken,
	isLoggedIn,
	getApiUrl,
	getAuthHeaders,
	isFormValid,
	hasFieldError,
	getFieldErrors,
	extractErrorMessage
} from '../../../src/app/utils/auth-utils';

describe('Frontend Auth Utils', () => {
	let localStorageMock: any;
	beforeEach(() => {
		// Create Jest spy mocks directly here
		localStorageMock = {
			getItem: jest.fn(() => null),
			setItem: jest.fn(),
			removeItem: jest.fn(),
			clear: jest.fn()
		};

		// Override global references AND jsdom's localStorage
		global.localStorage = localStorageMock;
		(global.window as any).localStorage = localStorageMock;

		// Also override the global scope localStorage directly and in window
		(global as any).localStorage = localStorageMock;
		Object.defineProperty(global.window, 'localStorage', {
			value: localStorageMock,
			writable: true
		});
	});

	describe('Token Management', () => {
		test('should store token in localStorage', () => {
			const testToken = 'test-jwt-token';

			setToken(testToken);

			expect(localStorageMock.setItem).toHaveBeenCalledWith('token', testToken);
		});

		test('should retrieve token from localStorage', () => {
			const testToken = 'test-jwt-token';
			localStorageMock.getItem.mockReturnValue(testToken);

			const retrievedToken = getToken();

			expect(localStorageMock.getItem).toHaveBeenCalledWith('token');
			expect(retrievedToken).toBe(testToken);
		});

		test('should clear token from localStorage', () => {
			clearToken();

			expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
		});

		test('should return true when user is logged in', () => {
			localStorageMock.getItem.mockReturnValue('some-token');

			const loggedIn = isLoggedIn();

			expect(loggedIn).toBe(true);
		});

		test('should return false when user is not logged in', () => {
			localStorageMock.getItem.mockReturnValue(null);

			const loggedIn = isLoggedIn();

			expect(loggedIn).toBe(false);
		});

		test('should handle missing localStorage gracefully', () => {
			// Remove localStorage from window
			delete (global as any).window.localStorage;

			expect(getToken()).toBeNull();
			expect(isLoggedIn()).toBe(false);

			// This should not throw
			expect(() => setToken('test')).not.toThrow();
			expect(() => clearToken()).not.toThrow();

			// Restore localStorage for other tests
			(global as any).window.localStorage = {
				getItem: jest.fn(),
				setItem: jest.fn(),
				removeItem: jest.fn(),
				clear: jest.fn()
			};
		});

		test('should handle missing window object', () => {
			// Remove window entirely
			delete (global as any).window;

			expect(getToken()).toBeNull();
			expect(isLoggedIn()).toBe(false);

			// This should not throw
			expect(() => setToken('test')).not.toThrow();
			expect(() => clearToken()).not.toThrow();

			// Restore window for other tests
			(global as any).window = {
				localStorage: {
					getItem: jest.fn(),
					setItem: jest.fn(),
					removeItem: jest.fn(),
					clear: jest.fn()
				},
				location: {
					origin: 'https://example.com'
				}
			};
		});
	});

	describe('API Configuration', () => {
		test('should construct API URL from window.location', () => {
			const apiUrl = getApiUrl();

			// The function should use window.location.origin if available
			if (typeof window !== 'undefined' && window.location && window.location.origin) {
				expect(apiUrl).toBe(`${window.location.origin}/api`);
			} else {
				expect(apiUrl).toBe('http://localhost/api');
			}
		});

		test('should provide fallback API URL when window is not available', () => {
			delete (global as any).window;

			const apiUrl = getApiUrl();

			expect(apiUrl).toBe('http://localhost/api');

			// Restore window for other tests
			(global as any).window = {
				localStorage: {
					getItem: jest.fn(),
					setItem: jest.fn(),
					removeItem: jest.fn(),
					clear: jest.fn()
				},
				location: {
					origin: 'https://example.com'
				}
			};
		});

		test('should build auth headers without token', () => {
			(global.window.localStorage.getItem as jest.Mock).mockReturnValue(null);

			const headers = getAuthHeaders();

			expect(headers).toEqual({
				'Content-Type': 'application/json'
			});
		});

		test('should build auth headers with token', () => {
			const testToken = 'test-jwt-token';
			(global.window.localStorage.getItem as jest.Mock).mockReturnValue(testToken);

			const headers = getAuthHeaders();

			expect(headers).toEqual({
				'Content-Type': 'application/json',
				Authorization: `Bearer ${testToken}`
			});
		});
	});

	describe('Form Validation', () => {
		test('should validate form with all required fields and no errors', () => {
			const email = 'test@example.com';
			const password = 'password123';
			const errors = {};

			const isValid = isFormValid(email, password, errors);
			expect(isValid).toBe(true);
		});

		test('should reject form with errors present', () => {
			const email = 'test@example.com';
			const password = 'password123';
			const errors = { email: ['Invalid email'] };

			const isValid = isFormValid(email, password, errors);
			expect(isValid).toBe(false);
		});

		test('should reject form with empty email', () => {
			const email = '';
			const password = 'password123';
			const errors = {};

			const isValid = isFormValid(email, password, errors);
			expect(isValid).toBe(false);
		});

		test('should reject form with whitespace-only email', () => {
			const email = '   ';
			const password = 'password123';
			const errors = {};

			const isValid = isFormValid(email, password, errors);
			expect(isValid).toBe(false);
		});

		test('should reject form with empty password', () => {
			const email = 'test@example.com';
			const password = '';
			const errors = {};

			const isValid = isFormValid(email, password, errors);
			expect(isValid).toBe(false);
		});

		test('should reject form with whitespace-only password', () => {
			const email = 'test@example.com';
			const password = '   ';
			const errors = {};

			const isValid = isFormValid(email, password, errors);
			expect(isValid).toBe(false);
		});
	});

	describe('Error Handling', () => {
		test('should detect field errors correctly when touched and has errors', () => {
			const errors = {
				email: ['Invalid email format'],
				password: ['Password too short']
			};
			const touched = { email: true, password: true };
			const submitAttempted = false;

			expect(hasFieldError('email', errors, touched, submitAttempted)).toBe(true);
			expect(hasFieldError('password', errors, touched, submitAttempted)).toBe(true);
		});

		test('should not detect field errors when not touched and submit not attempted', () => {
			const errors = {
				email: ['Invalid email format'],
				password: ['Password too short']
			};
			const touched = { email: false, password: false };
			const submitAttempted = false;

			expect(hasFieldError('email', errors, touched, submitAttempted)).toBe(false);
			expect(hasFieldError('password', errors, touched, submitAttempted)).toBe(false);
		});

		test('should detect field errors when submit attempted even if not touched', () => {
			const errors = {
				email: ['Invalid email format']
			};
			const touched = { email: false };
			const submitAttempted = true;

			expect(hasFieldError('email', errors, touched, submitAttempted)).toBe(true);
		});

		test('should not detect errors for fields without errors', () => {
			const errors = {};
			const touched = { email: true };
			const submitAttempted = false;

			expect(hasFieldError('email', errors, touched, submitAttempted)).toBe(false);
		});

		test('should get field error messages', () => {
			const errors = {
				email: ['Invalid email format', 'Email already exists'],
				password: ['Password too short']
			};

			const emailErrors = getFieldErrors('email', errors);
			expect(emailErrors).toEqual(['Invalid email format', 'Email already exists']);

			const passwordErrors = getFieldErrors('password', errors);
			expect(passwordErrors).toEqual(['Password too short']);

			const nameErrors = getFieldErrors('name', errors);
			expect(nameErrors).toEqual([]);
		});

		test('should handle missing errors object for getFieldErrors', () => {
			const emptyErrors = {};
			expect(getFieldErrors('email', emptyErrors)).toEqual([]);
		});

		test('should extract error message from nested error object', () => {
			const nestedError = {
				error: {
					message: 'Invalid credentials'
				}
			};
			const errorMessage = extractErrorMessage(nestedError);
			expect(errorMessage).toBe('Invalid credentials');
		});

		test('should extract error message from object with message', () => {
			const errorObject = {
				message: 'Network error'
			};
			const errorMessage = extractErrorMessage(errorObject);
			expect(errorMessage).toBe('Network error');
		});

		test('should provide default error message for unknown format', () => {
			const unknownError = { unknownProperty: 'value' };
			const errorMessage = extractErrorMessage(unknownError);
			expect(errorMessage).toBe('An unexpected error occurred');
		});

		test('should handle null and undefined errors', () => {
			expect(extractErrorMessage(null)).toBe('An unexpected error occurred');
			expect(extractErrorMessage(undefined)).toBe('An unexpected error occurred');
		});
	});
});
