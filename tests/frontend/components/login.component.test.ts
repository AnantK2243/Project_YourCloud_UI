// tests/frontend/components/login.component.test.ts

// Mock dependencies for LoginComponent
const loginMockRouter = {
	navigate: jest.fn()
};

const loginMockAuthService = {
	login: jest.fn(),
	isLoggedIn: jest.fn()
};

const loginMockActivatedRoute = {
	queryParams: {
		subscribe: jest.fn()
	}
};

// Mock login component for testing
class MockLoginComponent {
	email: string = '';
	password: string = '';
	rememberMe: boolean = false;
	error: string = '';
	warning: string = '';
	loading: boolean = false;
	router: any;
	authService: any;
	activatedRoute: any;

	constructor() {
		this.router = loginMockRouter;
		this.authService = loginMockAuthService;
		this.activatedRoute = loginMockActivatedRoute;
	}

	ngOnInit(): void {
		// Check if already logged in
		if (this.authService.isLoggedIn()) {
			this.router.navigate(['/dashboard']);
			return;
		}

		// Subscribe to query parameters for potential redirects
		this.activatedRoute.queryParams.subscribe((params: any) => {
			if (params.message) {
				this.warning = params.message;
			}
		});
	}

	async login(): Promise<void> {
		if (!this.isFormValid()) {
			this.error = 'Please fill in all required fields';
			return;
		}

		this.loading = true;
		this.error = '';

		try {
			const response = await this.authService.login({
				email: this.email,
				password: this.password,
				rememberMe: this.rememberMe
			});

			if (response.success) {
				this.router.navigate(['/dashboard']);
			} else {
				this.error = response.message || 'Login failed';
			}
		} catch (error: any) {
			this.error = error.message || 'An error occurred during login';
		} finally {
			this.loading = false;
		}
	}

	isFormValid(): boolean {
		return !!(this.email?.trim() && this.password?.trim());
	}

	validateEmail(): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(this.email);
	}

	clearMessages(): void {
		this.error = '';
		this.warning = '';
	}

	navigateToRegister(): void {
		this.router.navigate(['/register']);
	}

	onEmailChange(): void {
		this.clearMessages();
	}

	onPasswordChange(): void {
		this.clearMessages();
	}
}

describe('LoginComponent', () => {
	let component: MockLoginComponent;

	beforeEach(() => {
		jest.clearAllMocks();
		component = new MockLoginComponent();

		// Default mock implementations
		loginMockAuthService.isLoggedIn.mockReturnValue(false);
		loginMockActivatedRoute.queryParams.subscribe.mockImplementation((callback: any) => {
			callback({});
			return { unsubscribe: jest.fn() };
		});
	});

	describe('Component Initialization', () => {
		test('should create the component', () => {
			expect(component).toBeTruthy();
		});

		test('should initialize with default values', () => {
			expect(component.email).toBe('');
			expect(component.password).toBe('');
			expect(component.rememberMe).toBe(false);
			expect(component.error).toBe('');
			expect(component.warning).toBe('');
			expect(component.loading).toBe(false);
		});

		test('should redirect to dashboard if already logged in', () => {
			loginMockAuthService.isLoggedIn.mockReturnValue(true);

			component.ngOnInit();

			expect(loginMockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
		});

		test('should handle query parameter messages', () => {
			const testMessage = 'Session expired. Please log in again.';
			loginMockActivatedRoute.queryParams.subscribe.mockImplementation((callback: any) => {
				callback({ message: testMessage });
				return { unsubscribe: jest.fn() };
			});

			component.ngOnInit();

			expect(component.warning).toBe(testMessage);
		});
	});

	describe('Form Validation', () => {
		test('should validate form with required fields', () => {
			component.email = 'test@example.com';
			component.password = 'password123';

			expect(component.isFormValid()).toBe(true);
		});

		test('should reject form with missing email', () => {
			component.email = '';
			component.password = 'password123';

			expect(component.isFormValid()).toBe(false);
		});

		test('should reject form with missing password', () => {
			component.email = 'test@example.com';
			component.password = '';

			expect(component.isFormValid()).toBe(false);
		});

		test('should reject form with whitespace-only fields', () => {
			component.email = '   ';
			component.password = '   ';

			expect(component.isFormValid()).toBe(false);
		});

		test('should validate email format', () => {
			component.email = 'test@example.com';
			expect(component.validateEmail()).toBe(true);

			component.email = 'invalid-email';
			expect(component.validateEmail()).toBe(false);

			component.email = 'test@';
			expect(component.validateEmail()).toBe(false);

			component.email = '@example.com';
			expect(component.validateEmail()).toBe(false);
		});
	});

	describe('Login Process', () => {
		test('should login successfully', async () => {
			const mockResponse = {
				success: true,
				token: 'jwt-token-123',
				user: { id: 1, email: 'test@example.com' }
			};

			loginMockAuthService.login.mockResolvedValue(mockResponse);
			component.email = 'test@example.com';
			component.password = 'password123';

			await component.login();

			expect(loginMockAuthService.login).toHaveBeenCalledWith({
				email: 'test@example.com',
				password: 'password123',
				rememberMe: false
			});
			expect(loginMockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
			expect(component.loading).toBe(false);
		});

		test('should handle login failure with message', async () => {
			const mockResponse = {
				success: false,
				message: 'Invalid credentials'
			};

			loginMockAuthService.login.mockResolvedValue(mockResponse);
			component.email = 'test@example.com';
			component.password = 'wrongpassword';

			await component.login();

			expect(component.error).toBe('Invalid credentials');
			expect(loginMockRouter.navigate).not.toHaveBeenCalled();
			expect(component.loading).toBe(false);
		});

		test('should handle login failure without message', async () => {
			const mockResponse = {
				success: false
			};

			loginMockAuthService.login.mockResolvedValue(mockResponse);
			component.email = 'test@example.com';
			component.password = 'wrongpassword';

			await component.login();

			expect(component.error).toBe('Login failed');
			expect(component.loading).toBe(false);
		});

		test('should handle network error', async () => {
			const networkError = new Error('Network connection failed');
			loginMockAuthService.login.mockRejectedValue(networkError);

			component.email = 'test@example.com';
			component.password = 'password123';

			await component.login();

			expect(component.error).toBe('Network connection failed');
			expect(component.loading).toBe(false);
		});

		test('should handle error without message', async () => {
			const unknownError = new Error();
			loginMockAuthService.login.mockRejectedValue(unknownError);

			component.email = 'test@example.com';
			component.password = 'password123';

			await component.login();

			expect(component.error).toBe('An error occurred during login');
			expect(component.loading).toBe(false);
		});

		test('should not submit with invalid form', async () => {
			component.email = '';
			component.password = '';

			await component.login();

			expect(component.error).toBe('Please fill in all required fields');
			expect(loginMockAuthService.login).not.toHaveBeenCalled();
		});

		test('should set loading state during login', async () => {
			let resolveLogin: (value: any) => void;
			const loginPromise = new Promise(resolve => {
				resolveLogin = resolve;
			});

			loginMockAuthService.login.mockReturnValue(loginPromise);
			component.email = 'test@example.com';
			component.password = 'password123';

			const loginCall = component.login();

			// Check loading state is true during the call
			expect(component.loading).toBe(true);

			// Resolve the promise
			resolveLogin!({ success: true });
			await loginCall;

			// Check loading state is false after completion
			expect(component.loading).toBe(false);
		});

		test('should handle remember me option', async () => {
			const mockResponse = { success: true };
			loginMockAuthService.login.mockResolvedValue(mockResponse);

			component.email = 'test@example.com';
			component.password = 'password123';
			component.rememberMe = true;

			await component.login();

			expect(loginMockAuthService.login).toHaveBeenCalledWith({
				email: 'test@example.com',
				password: 'password123',
				rememberMe: true
			});
		});
	});

	describe('Navigation', () => {
		test('should navigate to register page', () => {
			component.navigateToRegister();

			expect(loginMockRouter.navigate).toHaveBeenCalledWith(['/register']);
		});
	});

	describe('Message Management', () => {
		test('should clear messages', () => {
			component.error = 'Test error';
			component.warning = 'Test warning';

			component.clearMessages();

			expect(component.error).toBe('');
			expect(component.warning).toBe('');
		});

		test('should clear messages on email change', () => {
			component.error = 'Test error';
			component.warning = 'Test warning';

			component.onEmailChange();

			expect(component.error).toBe('');
			expect(component.warning).toBe('');
		});

		test('should clear messages on password change', () => {
			component.error = 'Test error';
			component.warning = 'Test warning';

			component.onPasswordChange();

			expect(component.error).toBe('');
			expect(component.warning).toBe('');
		});
	});

	describe('Edge Cases', () => {
		test('should handle null email and password', () => {
			component.email = null as any;
			component.password = null as any;

			expect(component.isFormValid()).toBe(false);
		});

		test('should handle very long credentials', async () => {
			const longString = 'a'.repeat(1000);
			const mockResponse = { success: true };
			loginMockAuthService.login.mockResolvedValue(mockResponse);

			component.email = `${longString}@example.com`;
			component.password = longString;

			await component.login();

			expect(loginMockAuthService.login).toHaveBeenCalledWith({
				email: `${longString}@example.com`,
				password: longString,
				rememberMe: false
			});
		});

		test('should handle multiple rapid login attempts', async () => {
			const mockResponse = { success: true };
			loginMockAuthService.login.mockResolvedValue(mockResponse);

			component.email = 'test@example.com';
			component.password = 'password123';

			// Simulate rapid clicking
			const promises = [component.login(), component.login(), component.login()];

			await Promise.all(promises);

			// Should have been called multiple times
			expect(loginMockAuthService.login).toHaveBeenCalledTimes(3);
		});

		test('should handle special characters in credentials', async () => {
			const mockResponse = { success: true };
			loginMockAuthService.login.mockResolvedValue(mockResponse);

			component.email = 'test+123@example.com';
			component.password = 'P@ssw0rd!#$%';

			await component.login();

			expect(loginMockAuthService.login).toHaveBeenCalledWith({
				email: 'test+123@example.com',
				password: 'P@ssw0rd!#$%',
				rememberMe: false
			});
		});
	});
});
