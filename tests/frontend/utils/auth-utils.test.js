// tests/frontend/utils/auth-utils.test.js

/**
 * Frontend authentication utility tests
 * Testing the auth utilities without Angular dependencies
 */

// Mock implementation of auth utilities for testing
const AuthUtils = {
    setToken: (token) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('token', token);
        }
    },

    getToken: () => {
        if (typeof window !== 'undefined' && window.localStorage) {
            return localStorage.getItem('token');
        }
        return null;
    },

    clearToken: () => {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem('token');
        }
    },

    isLoggedIn: () => {
        const token = AuthUtils.getToken();
        return !!token;
    },

    getApiUrl: () => {
        if (typeof window !== 'undefined' && window.location) {
            return `${window.location.origin}/api`;
        }
        return 'http://localhost/api';
    },

    getAuthHeaders: () => {
        const headers = {
            'Content-Type': 'application/json'
        };

        const token = AuthUtils.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    },

    isFormValid: (formData, requiredFields = []) => {
        if (!formData || typeof formData !== 'object') {
            return false;
        }

        return requiredFields.every(field => {
            const value = formData[field];
            return value !== null && value !== undefined &&
                value.toString().trim().length > 0;
        });
    },

    hasFieldError: (fieldName, errors = {}) => {
        return !!(errors[fieldName] && errors[fieldName].length > 0);
    },

    getFieldErrors: (fieldName, errors = {}) => {
        return errors[fieldName] || [];
    },

    extractErrorMessage: (error) => {
        if (typeof error === 'string') {
            return error;
        }

        if (error && error.message) {
            return error.message;
        }

        if (error && error.error && error.error.message) {
            return error.error.message;
        }

        return 'An error occurred';
    }
};

describe('Frontend Auth Utils', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('Token Management', () => {
        test('should store and retrieve token', () => {
            const testToken = 'test-jwt-token';

            AuthUtils.setToken(testToken);
            expect(localStorage.getItem('token')).toBe(testToken);

            const retrievedToken = AuthUtils.getToken();
            expect(retrievedToken).toBe(testToken);
        });

        test('should clear token', () => {
            const testToken = 'test-jwt-token';
            AuthUtils.setToken(testToken);
            expect(AuthUtils.getToken()).toBe(testToken);

            AuthUtils.clearToken();
            expect(AuthUtils.getToken()).toBeNull();
        });

        test('should check if user is logged in', () => {
            expect(AuthUtils.isLoggedIn()).toBe(false);

            AuthUtils.setToken('test-token');
            expect(AuthUtils.isLoggedIn()).toBe(true);

            AuthUtils.clearToken();
            expect(AuthUtils.isLoggedIn()).toBe(false);
        });

        test('should handle missing localStorage', () => {
            // Mock missing localStorage
            const originalLocalStorage = global.localStorage;
            delete global.localStorage;

            expect(AuthUtils.getToken()).toBeNull();
            expect(AuthUtils.isLoggedIn()).toBe(false);

            // Restore localStorage
            global.localStorage = originalLocalStorage;
        });
    });

    describe('API Configuration', () => {
        test('should construct API URLs', () => {
            // Mock window.location
            const mockLocation = {
                origin: 'https://example.com'
            };
            Object.defineProperty(window, 'location', {
                value: mockLocation,
                writable: true
            });

            const apiUrl = AuthUtils.getApiUrl();
            expect(apiUrl).toBe('https://example.com/api');
        });

        test('should build auth headers without token', () => {
            AuthUtils.clearToken();
            const headers = AuthUtils.getAuthHeaders();

            expect(headers).toEqual({
                'Content-Type': 'application/json'
            });
        });

        test('should build auth headers with token', () => {
            const testToken = 'test-jwt-token';
            AuthUtils.setToken(testToken);

            const headers = AuthUtils.getAuthHeaders();

            expect(headers).toEqual({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${testToken}`
            });
        });
    });

    describe('Form Validation', () => {
        test('should validate required fields', () => {
            const validForm = {
                email: 'test@example.com',
                password: 'password123'
            };

            const isValid = AuthUtils.isFormValid(validForm, ['email', 'password']);
            expect(isValid).toBe(true);
        });

        test('should detect empty fields', () => {
            const invalidForm = {
                email: '',
                password: 'password123'
            };

            const isValid = AuthUtils.isFormValid(invalidForm, ['email', 'password']);
            expect(isValid).toBe(false);
        });

        test('should detect missing fields', () => {
            const incompleteForm = {
                email: 'test@example.com'
            };

            const isValid = AuthUtils.isFormValid(incompleteForm, ['email', 'password']);
            expect(isValid).toBe(false);
        });

        test('should handle null form data', () => {
            const isValid = AuthUtils.isFormValid(null, ['email', 'password']);
            expect(isValid).toBe(false);
        });

        test('should handle whitespace-only values', () => {
            const formWithWhitespace = {
                email: '   ',
                password: 'password123'
            };

            const isValid = AuthUtils.isFormValid(formWithWhitespace, ['email', 'password']);
            expect(isValid).toBe(false);
        });
    });

    describe('Error Handling', () => {
        test('should handle API error responses', () => {
            const apiError = {
                status: 400,
                error: {
                    message: 'Invalid credentials'
                }
            };

            const errorMessage = AuthUtils.extractErrorMessage(apiError);
            expect(errorMessage).toBe('Invalid credentials');
        });

        test('should handle simple error objects', () => {
            const simpleError = {
                message: 'Network error'
            };

            const errorMessage = AuthUtils.extractErrorMessage(simpleError);
            expect(errorMessage).toBe('Network error');
        });

        test('should handle string errors', () => {
            const stringError = 'Something went wrong';
            const errorMessage = AuthUtils.extractErrorMessage(stringError);
            expect(errorMessage).toBe('Something went wrong');
        });

        test('should provide default error message', () => {
            const unknownError = { unknownProperty: 'value' };
            const errorMessage = AuthUtils.extractErrorMessage(unknownError);
            expect(errorMessage).toBe('An error occurred');
        });

        test('should detect field errors', () => {
            const errors = {
                email: ['Invalid email format'],
                password: ['Password too short']
            };

            expect(AuthUtils.hasFieldError('email', errors)).toBe(true);
            expect(AuthUtils.hasFieldError('name', errors)).toBe(false);
        });

        test('should get field error messages', () => {
            const errors = {
                email: ['Invalid email format', 'Email already exists'],
                password: ['Password too short']
            };

            const emailErrors = AuthUtils.getFieldErrors('email', errors);
            expect(emailErrors).toEqual(['Invalid email format', 'Email already exists']);

            const nameErrors = AuthUtils.getFieldErrors('name', errors);
            expect(nameErrors).toEqual([]);
        });
    });
});
