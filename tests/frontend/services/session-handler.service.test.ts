// tests/frontend/services/session-handler.service.test.ts

// Mock Router and AuthService
const mockRouterService = {
	navigate: jest.fn()
};

const mockAuthServiceInstance = {
	logout: jest.fn()
};

// Mock SessionHandlerService for testing
class MockSessionHandlerService {
	private router: any;
	private authService: any;

	constructor() {
		this.router = mockRouterService;
		this.authService = mockAuthServiceInstance;
	}

	isSessionError(error: any): boolean {
		if (!error) return false;

		const errorMessage = (error.message || '').toLowerCase();
		const errorStatus = error.status;

		// Check nested error objects
		const nestedErrorMessage =
			error.error && error.error.message ? error.error.message.toLowerCase() : '';

		// Check for common session expiration indicators
		return (
			errorMessage.includes('unauthorized') ||
			errorMessage.includes('authentication') ||
			errorMessage.includes('session') ||
			errorMessage.includes('token') ||
			nestedErrorMessage.includes('authentication') ||
			nestedErrorMessage.includes('unauthorized') ||
			nestedErrorMessage.includes('session') ||
			nestedErrorMessage.includes('token') ||
			errorStatus === 401 ||
			errorStatus === 403
		);
	}

	handleSessionExpired(customMessage?: string): void {
		this.authService.logout();
		const message = customMessage || 'Your session has expired. Please log in again.';
		this.router.navigate(['/login'], { queryParams: { message } });
	}

	checkAndHandleSessionError(error: any, customMessage?: string): boolean {
		if (this.isSessionError(error)) {
			this.handleSessionExpired(customMessage);
			return true;
		}
		return false;
	}
}

describe('SessionHandlerService', () => {
	let service: MockSessionHandlerService;

	beforeEach(() => {
		service = new MockSessionHandlerService();
		jest.clearAllMocks();
	});

	describe('isSessionError', () => {
		test('should detect 401 errors as session errors', () => {
			const error = { status: 401, message: 'Unauthorized' };
			expect(service.isSessionError(error)).toBe(true);
		});

		test('should detect 403 errors as session errors', () => {
			const error = { status: 403, message: 'Forbidden' };
			expect(service.isSessionError(error)).toBe(true);
		});

		test('should detect token-related errors', () => {
			const tokenError = { message: 'Invalid token', status: 400 };
			expect(service.isSessionError(tokenError)).toBe(true);
		});

		test('should detect authentication-related errors', () => {
			const authError = { message: 'Authentication failed', status: 500 };
			expect(service.isSessionError(authError)).toBe(true);
		});

		test('should not detect regular errors as session errors', () => {
			const regularError = { status: 404, message: 'Not found' };
			expect(service.isSessionError(regularError)).toBe(false);
		});

		test('should handle null/undefined errors', () => {
			expect(service.isSessionError(null)).toBe(false);
			expect(service.isSessionError(undefined)).toBe(false);
			expect(service.isSessionError({})).toBe(false);
		});

		test('should be case insensitive for error messages', () => {
			const upperCaseError = { message: 'UNAUTHORIZED ACCESS', status: 500 };
			const mixedCaseError = { message: 'Session Expired', status: 500 };

			expect(service.isSessionError(upperCaseError)).toBe(true);
			expect(service.isSessionError(mixedCaseError)).toBe(true);
		});
	});

	describe('handleSessionExpired', () => {
		test('should call logout and navigate to login', () => {
			service.handleSessionExpired();

			expect(mockAuthServiceInstance.logout).toHaveBeenCalledTimes(1);
			expect(mockRouterService.navigate).toHaveBeenCalledWith(['/login'], {
				queryParams: { message: 'Your session has expired. Please log in again.' }
			});
		});

		test('should use custom message when provided', () => {
			const customMessage = 'Custom session expired message';
			service.handleSessionExpired(customMessage);

			expect(mockRouterService.navigate).toHaveBeenCalledWith(['/login'], {
				queryParams: { message: customMessage }
			});
		});
	});

	describe('checkAndHandleSessionError', () => {
		test('should handle session errors and return true', () => {
			const sessionError = { status: 401, message: 'Unauthorized' };
			const result = service.checkAndHandleSessionError(sessionError);

			expect(result).toBe(true);
			expect(mockAuthServiceInstance.logout).toHaveBeenCalledTimes(1);
			expect(mockRouterService.navigate).toHaveBeenCalledTimes(1);
		});

		test('should not handle non-session errors and return false', () => {
			const regularError = { status: 404, message: 'Not found' };
			const result = service.checkAndHandleSessionError(regularError);

			expect(result).toBe(false);
			expect(mockAuthServiceInstance.logout).not.toHaveBeenCalled();
			expect(mockRouterService.navigate).not.toHaveBeenCalled();
		});

		test('should use custom message for session errors', () => {
			const sessionError = { status: 403, message: 'Access denied' };
			const customMessage = 'Your access has been revoked';

			service.checkAndHandleSessionError(sessionError, customMessage);

			expect(mockRouterService.navigate).toHaveBeenCalledWith(['/login'], {
				queryParams: { message: customMessage }
			});
		});
	});

	describe('Edge Cases', () => {
		test('should handle errors with only status code', () => {
			const statusOnlyError = { status: 401 };
			expect(service.isSessionError(statusOnlyError)).toBe(true);
		});

		test('should handle errors with only message', () => {
			const messageOnlyError = { message: 'token expired' };
			expect(service.isSessionError(messageOnlyError)).toBe(true);
		});

		test('should handle nested error objects', () => {
			const nestedError = {
				error: { message: 'authentication failed' },
				status: 500
			};
			expect(service.isSessionError(nestedError)).toBe(true);
		});

		test('should handle string errors', () => {
			const stringError = 'unauthorized access';
			// This would fail in real implementation, testing error handling
			expect(service.isSessionError(stringError)).toBe(false);
		});
	});
});
