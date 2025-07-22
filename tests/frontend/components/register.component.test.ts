// tests/frontend/components/register.component.test.ts

// Mock dependencies for RegisterComponent
const registerMockRouter = {
	navigate: jest.fn()
};

const registerMockAuthService = {
	register: jest.fn(),
	isLoggedIn: jest.fn()
};

// Mock register component for testing
class MockRegisterComponent {
	name: string = '';
	email: string = '';
	password: string = '';
	confirmPassword: string = '';
	agreeToTerms: boolean = false;
	error: string = '';
	warning: string = '';
	loading: boolean = false;
	router: any;
	authService: any;

	constructor() {
		this.router = registerMockRouter;
		this.authService = registerMockAuthService;
	}

	async register(): Promise<void> {
		if (!this.isFormValid()) {
			this.error = 'Please fill in all required fields';
			return;
		}

		if (!this.passwordsMatch()) {
			this.error = 'Passwords do not match';
			return;
		}

		if (!this.agreeToTerms) {
			this.error = 'Please agree to the terms and conditions';
			return;
		}

		this.loading = true;
		this.error = '';

		try {
			const response = await this.authService.register({
				name: this.name,
				email: this.email,
				password: this.password
			});

			if (response.success) {
				this.router.navigate(['/login'], {
					queryParams: { message: 'Registration successful! Please log in.' }
				});
			} else {
				this.error = response.message || 'Registration failed';
			}
		} catch (error: any) {
			this.error = error.message || 'An error occurred during registration';
		} finally {
			this.loading = false;
		}
	}

	isFormValid(): boolean {
		return !!(
			this.name?.trim() &&
			this.email?.trim() &&
			this.password?.trim() &&
			this.confirmPassword?.trim()
		);
	}

	passwordsMatch(): boolean {
		return this.password === this.confirmPassword;
	}

	validateEmail(): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(this.email);
	}

	validatePasswordStrength(): boolean {
		// Password must be at least 8 characters with uppercase, lowercase, and number
		const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
		return passwordRegex.test(this.password);
	}

	validateName(): boolean {
		// Name must be at least 2 characters and only contain letters and spaces
		const nameRegex = /^[a-zA-Z\s]{2,50}$/;
		return nameRegex.test(this.name);
	}

	clearMessages(): void {
		this.error = '';
		this.warning = '';
	}

	navigateToLogin(): void {
		this.router.navigate(['/login']);
	}

	onFieldChange(): void {
		this.clearMessages();
	}
}

describe('RegisterComponent', () => {
	let component: MockRegisterComponent;

	beforeEach(() => {
		jest.clearAllMocks();
		component = new MockRegisterComponent();

		// Default mock implementations
		registerMockAuthService.isLoggedIn.mockReturnValue(false);
	});

	describe('Component Initialization', () => {
		test('should create the component', () => {
			expect(component).toBeTruthy();
		});

		test('should initialize with default values', () => {
			expect(component.name).toBe('');
			expect(component.email).toBe('');
			expect(component.password).toBe('');
			expect(component.confirmPassword).toBe('');
			expect(component.agreeToTerms).toBe(false);
			expect(component.error).toBe('');
			expect(component.warning).toBe('');
			expect(component.loading).toBe(false);
		});
	});

	describe('Form Validation', () => {
		test('should validate form with all required fields', () => {
			component.name = 'John Doe';
			component.email = 'john@example.com';
			component.password = 'Password123';
			component.confirmPassword = 'Password123';

			expect(component.isFormValid()).toBe(true);
		});

		test('should reject form with missing name', () => {
			component.name = '';
			component.email = 'john@example.com';
			component.password = 'Password123';
			component.confirmPassword = 'Password123';

			expect(component.isFormValid()).toBe(false);
		});

		test('should reject form with missing email', () => {
			component.name = 'John Doe';
			component.email = '';
			component.password = 'Password123';
			component.confirmPassword = 'Password123';

			expect(component.isFormValid()).toBe(false);
		});

		test('should reject form with missing password', () => {
			component.name = 'John Doe';
			component.email = 'john@example.com';
			component.password = '';
			component.confirmPassword = 'Password123';

			expect(component.isFormValid()).toBe(false);
		});

		test('should reject form with missing confirm password', () => {
			component.name = 'John Doe';
			component.email = 'john@example.com';
			component.password = 'Password123';
			component.confirmPassword = '';

			expect(component.isFormValid()).toBe(false);
		});

		test('should validate password match', () => {
			component.password = 'Password123';
			component.confirmPassword = 'Password123';
			expect(component.passwordsMatch()).toBe(true);

			component.confirmPassword = 'DifferentPassword';
			expect(component.passwordsMatch()).toBe(false);
		});

		test('should validate email format', () => {
			component.email = 'john@example.com';
			expect(component.validateEmail()).toBe(true);

			component.email = 'invalid-email';
			expect(component.validateEmail()).toBe(false);

			component.email = 'john@';
			expect(component.validateEmail()).toBe(false);

			component.email = '@example.com';
			expect(component.validateEmail()).toBe(false);
		});

		test('should validate password strength', () => {
			component.password = 'Password123';
			expect(component.validatePasswordStrength()).toBe(true);

			component.password = 'password'; // no uppercase, no numbers
			expect(component.validatePasswordStrength()).toBe(false);

			component.password = 'PASSWORD123'; // no lowercase
			expect(component.validatePasswordStrength()).toBe(false);

			component.password = 'Password'; // no numbers
			expect(component.validatePasswordStrength()).toBe(false);

			component.password = 'Pass1'; // too short
			expect(component.validatePasswordStrength()).toBe(false);
		});

		test('should validate name format', () => {
			component.name = 'John Doe';
			expect(component.validateName()).toBe(true);

			component.name = 'John';
			expect(component.validateName()).toBe(true);

			component.name = 'J';
			expect(component.validateName()).toBe(false);

			component.name = 'John123';
			expect(component.validateName()).toBe(false);

			component.name = 'John@Doe';
			expect(component.validateName()).toBe(false);

			component.name = 'a'.repeat(51);
			expect(component.validateName()).toBe(false);
		});
	});

	describe('Registration Process', () => {
		test('should register successfully', async () => {
			const mockResponse = {
				success: true,
				user: { id: 1, name: 'John Doe', email: 'john@example.com' }
			};

			registerMockAuthService.register.mockResolvedValue(mockResponse);

			component.name = 'John Doe';
			component.email = 'john@example.com';
			component.password = 'Password123';
			component.confirmPassword = 'Password123';
			component.agreeToTerms = true;

			await component.register();

			expect(registerMockAuthService.register).toHaveBeenCalledWith({
				name: 'John Doe',
				email: 'john@example.com',
				password: 'Password123'
			});
			expect(registerMockRouter.navigate).toHaveBeenCalledWith(['/login'], {
				queryParams: { message: 'Registration successful! Please log in.' }
			});
			expect(component.loading).toBe(false);
		});

		test('should handle registration failure with message', async () => {
			const mockResponse = {
				success: false,
				message: 'Email already exists'
			};

			registerMockAuthService.register.mockResolvedValue(mockResponse);

			component.name = 'John Doe';
			component.email = 'existing@example.com';
			component.password = 'Password123';
			component.confirmPassword = 'Password123';
			component.agreeToTerms = true;

			await component.register();

			expect(component.error).toBe('Email already exists');
			expect(registerMockRouter.navigate).not.toHaveBeenCalled();
			expect(component.loading).toBe(false);
		});

		test('should handle registration failure without message', async () => {
			const mockResponse = {
				success: false
			};

			registerMockAuthService.register.mockResolvedValue(mockResponse);

			component.name = 'John Doe';
			component.email = 'john@example.com';
			component.password = 'Password123';
			component.confirmPassword = 'Password123';
			component.agreeToTerms = true;

			await component.register();

			expect(component.error).toBe('Registration failed');
			expect(component.loading).toBe(false);
		});

		test('should handle network error', async () => {
			const networkError = new Error('Network connection failed');
			registerMockAuthService.register.mockRejectedValue(networkError);

			component.name = 'John Doe';
			component.email = 'john@example.com';
			component.password = 'Password123';
			component.confirmPassword = 'Password123';
			component.agreeToTerms = true;

			await component.register();

			expect(component.error).toBe('Network connection failed');
			expect(component.loading).toBe(false);
		});

		test('should not submit with invalid form', async () => {
			component.name = '';
			component.email = '';
			component.password = '';
			component.confirmPassword = '';

			await component.register();

			expect(component.error).toBe('Please fill in all required fields');
			expect(registerMockAuthService.register).not.toHaveBeenCalled();
		});

		test('should not submit with password mismatch', async () => {
			component.name = 'John Doe';
			component.email = 'john@example.com';
			component.password = 'Password123';
			component.confirmPassword = 'DifferentPassword';
			component.agreeToTerms = true;

			await component.register();

			expect(component.error).toBe('Passwords do not match');
			expect(registerMockAuthService.register).not.toHaveBeenCalled();
		});

		test('should not submit without agreeing to terms', async () => {
			component.name = 'John Doe';
			component.email = 'john@example.com';
			component.password = 'Password123';
			component.confirmPassword = 'Password123';
			component.agreeToTerms = false;

			await component.register();

			expect(component.error).toBe('Please agree to the terms and conditions');
			expect(registerMockAuthService.register).not.toHaveBeenCalled();
		});
	});

	describe('Navigation', () => {
		test('should navigate to login page', () => {
			component.navigateToLogin();

			expect(registerMockRouter.navigate).toHaveBeenCalledWith(['/login']);
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

		test('should clear messages on field change', () => {
			component.error = 'Test error';
			component.warning = 'Test warning';

			component.onFieldChange();

			expect(component.error).toBe('');
			expect(component.warning).toBe('');
		});
	});

	describe('Edge Cases', () => {
		test('should handle whitespace-only fields', () => {
			component.name = '   ';
			component.email = '   ';
			component.password = '   ';
			component.confirmPassword = '   ';

			expect(component.isFormValid()).toBe(false);
		});

		test('should handle special characters in name', () => {
			component.name = "John O'Connor-Smith Jr.";
			expect(component.validateName()).toBe(false); // Special chars not allowed

			component.name = 'João Silva'; // Unicode characters
			expect(component.validateName()).toBe(false); // Only basic latin allowed
		});

		test('should handle very long inputs', async () => {
			const longString = 'a'.repeat(1000);
			const mockResponse = { success: true };
			registerMockAuthService.register.mockResolvedValue(mockResponse);

			component.name = longString;
			component.email = `${longString}@example.com`;
			component.password = `${longString}Password123`;
			component.confirmPassword = `${longString}Password123`;
			component.agreeToTerms = true;

			await component.register();

			expect(registerMockAuthService.register).toHaveBeenCalled();
		});

		test('should handle null values', () => {
			component.name = null as any;
			component.email = null as any;
			component.password = null as any;
			component.confirmPassword = null as any;

			expect(component.isFormValid()).toBe(false);
		});
	});
});
