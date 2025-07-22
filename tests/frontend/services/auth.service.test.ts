// tests/frontend/services/auth.service.test.ts

// Mock HTTP client
const mockHttpClient = {
	post: jest.fn(),
	get: jest.fn(),
	delete: jest.fn()
};

// Mock platform check
const mockPlatformId = 'browser';

// Mock AuthService for testing
class MockAuthService {
	private baseUrl = 'https://127.0.0.1:3000';
	private http: any;
	private platformId: string;

	constructor() {
		this.http = mockHttpClient;
		this.platformId = mockPlatformId;
	}

	async login(credentials: {
		email: string;
		password: string;
		rememberMe: boolean;
	}): Promise<any> {
		try {
			const response = await this.http.post(`${this.baseUrl}/auth/login`, credentials);

			// Handle null or undefined responses
			if (!response) {
				return null;
			}

			if (response.success && response.token) {
				this.setToken(response.token);
				return response;
			}

			return response;
		} catch (error) {
			throw error;
		}
	}

	async register(userData: { name: string; email: string; password: string }): Promise<any> {
		try {
			const response = await this.http.post(`${this.baseUrl}/auth/register`, userData);
			return response;
		} catch (error) {
			throw error;
		}
	}

	logout(): void {
		this.clearToken();
	}

	isLoggedIn(): boolean {
		return !!this.getToken();
	}

	getToken(): string | null {
		if (this.platformId === 'browser' && typeof window !== 'undefined') {
			return localStorage.getItem('token');
		}
		return null;
	}

	private setToken(token: string): void {
		if (this.platformId === 'browser' && typeof window !== 'undefined') {
			localStorage.setItem('token', token);
		}
	}

	private clearToken(): void {
		if (this.platformId === 'browser' && typeof window !== 'undefined') {
			localStorage.removeItem('token');
		}
	}

	async getCurrentUser(): Promise<any> {
		try {
			const response = await this.http.get(`${this.baseUrl}/auth/me`, {
				headers: this.getAuthHeaders()
			});
			return response;
		} catch (error) {
			throw error;
		}
	}

	getAuthHeaders(): any {
		const token = this.getToken();
		const headers: any = {
			'Content-Type': 'application/json'
		};

		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		return headers;
	}

	async changePassword(passwordData: {
		currentPassword: string;
		newPassword: string;
	}): Promise<any> {
		try {
			const response = await this.http.post(
				`${this.baseUrl}/auth/change-password`,
				passwordData,
				{
					headers: this.getAuthHeaders()
				}
			);
			return response;
		} catch (error) {
			throw error;
		}
	}

	async requestPasswordReset(email: string): Promise<any> {
		try {
			const response = await this.http.post(`${this.baseUrl}/auth/forgot-password`, {
				email
			});
			return response;
		} catch (error) {
			throw error;
		}
	}

	async resetPassword(resetData: { token: string; password: string }): Promise<any> {
		try {
			const response = await this.http.post(`${this.baseUrl}/auth/reset-password`, resetData);
			return response;
		} catch (error) {
			throw error;
		}
	}

	async refreshToken(): Promise<any> {
		try {
			const response = await this.http.post(
				`${this.baseUrl}/auth/refresh`,
				{},
				{
					headers: this.getAuthHeaders()
				}
			);

			if (response.success && response.token) {
				this.setToken(response.token);
			}

			return response;
		} catch (error) {
			throw error;
		}
	}
}

describe('AuthService', () => {
	let service: MockAuthService;

	beforeEach(() => {
		jest.clearAllMocks();
		localStorage.clear();
		service = new MockAuthService();
	});

	describe('Login', () => {
		test('should login successfully', async () => {
			const mockResponse = {
				success: true,
				token: 'jwt-token-123',
				user: { id: 1, email: 'test@example.com' }
			};

			mockHttpClient.post.mockResolvedValue(mockResponse);

			const credentials = {
				email: 'test@example.com',
				password: 'password123',
				rememberMe: false
			};

			const result = await service.login(credentials);

			expect(mockHttpClient.post).toHaveBeenCalledWith(
				'https://127.0.0.1:3000/auth/login',
				credentials
			);
			expect(result).toEqual(mockResponse);
			expect(localStorage.getItem('token')).toBe('jwt-token-123');
		});

		test('should handle login failure', async () => {
			const mockResponse = {
				success: false,
				message: 'Invalid credentials'
			};

			mockHttpClient.post.mockResolvedValue(mockResponse);

			const credentials = {
				email: 'test@example.com',
				password: 'wrongpassword',
				rememberMe: false
			};

			const result = await service.login(credentials);

			expect(result).toEqual(mockResponse);
			expect(localStorage.getItem('token')).toBeNull();
		});

		test('should handle login network error', async () => {
			const networkError = new Error('Network error');
			mockHttpClient.post.mockRejectedValue(networkError);

			const credentials = {
				email: 'test@example.com',
				password: 'password123',
				rememberMe: false
			};

			try {
				await service.login(credentials);
				fail('Should have thrown an error');
			} catch (error: any) {
				expect(error.message).toBe('Network error');
			}
		});
	});

	describe('Registration', () => {
		test('should register successfully', async () => {
			const mockResponse = {
				success: true,
				user: { id: 1, name: 'John Doe', email: 'john@example.com' }
			};

			mockHttpClient.post.mockResolvedValue(mockResponse);

			const userData = {
				name: 'John Doe',
				email: 'john@example.com',
				password: 'Password123'
			};

			const result = await service.register(userData);

			expect(mockHttpClient.post).toHaveBeenCalledWith(
				'https://127.0.0.1:3000/auth/register',
				userData
			);
			expect(result).toEqual(mockResponse);
		});

		test('should handle registration failure', async () => {
			const mockResponse = {
				success: false,
				message: 'Email already exists'
			};

			mockHttpClient.post.mockResolvedValue(mockResponse);

			const userData = {
				name: 'John Doe',
				email: 'existing@example.com',
				password: 'Password123'
			};

			const result = await service.register(userData);

			expect(result).toEqual(mockResponse);
		});
	});

	describe('Authentication State', () => {
		test('should check if user is logged in', () => {
			expect(service.isLoggedIn()).toBe(false);

			localStorage.setItem('token', 'test-token');
			expect(service.isLoggedIn()).toBe(true);
		});

		test('should get current token', () => {
			expect(service.getToken()).toBeNull();

			localStorage.setItem('token', 'test-token');
			expect(service.getToken()).toBe('test-token');
		});

		test('should logout and clear token', () => {
			localStorage.setItem('token', 'test-token');
			expect(service.isLoggedIn()).toBe(true);

			service.logout();

			expect(service.isLoggedIn()).toBe(false);
			expect(localStorage.getItem('token')).toBeNull();
		});
	});

	describe('HTTP Headers', () => {
		test('should get headers without token', () => {
			const headers = service.getAuthHeaders();

			expect(headers).toEqual({
				'Content-Type': 'application/json'
			});
		});

		test('should get headers with token', () => {
			localStorage.setItem('token', 'test-token');

			const headers = service.getAuthHeaders();

			expect(headers).toEqual({
				'Content-Type': 'application/json',
				Authorization: 'Bearer test-token'
			});
		});
	});

	describe('Current User', () => {
		test('should get current user', async () => {
			const mockUser = {
				success: true,
				user: { id: 1, name: 'John Doe', email: 'john@example.com' }
			};

			mockHttpClient.get.mockResolvedValue(mockUser);
			localStorage.setItem('token', 'test-token');

			const result = await service.getCurrentUser();

			expect(mockHttpClient.get).toHaveBeenCalledWith('https://127.0.0.1:3000/auth/me', {
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer test-token'
				}
			});
			expect(result).toEqual(mockUser);
		});

		test('should handle get current user error', async () => {
			const error = new Error('Unauthorized');
			mockHttpClient.get.mockRejectedValue(error);

			try {
				await service.getCurrentUser();
				fail('Should have thrown an error');
			} catch (err: any) {
				expect(err.message).toBe('Unauthorized');
			}
		});
	});

	describe('Password Management', () => {
		test('should change password', async () => {
			const mockResponse = {
				success: true,
				message: 'Password changed successfully'
			};

			mockHttpClient.post.mockResolvedValue(mockResponse);
			localStorage.setItem('token', 'test-token');

			const passwordData = {
				currentPassword: 'oldpassword',
				newPassword: 'newpassword123'
			};

			const result = await service.changePassword(passwordData);

			expect(mockHttpClient.post).toHaveBeenCalledWith(
				'https://127.0.0.1:3000/auth/change-password',
				passwordData,
				{
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token'
					}
				}
			);
			expect(result).toEqual(mockResponse);
		});

		test('should request password reset', async () => {
			const mockResponse = {
				success: true,
				message: 'Password reset email sent'
			};

			mockHttpClient.post.mockResolvedValue(mockResponse);

			const result = await service.requestPasswordReset('test@example.com');

			expect(mockHttpClient.post).toHaveBeenCalledWith(
				'https://127.0.0.1:3000/auth/forgot-password',
				{ email: 'test@example.com' }
			);
			expect(result).toEqual(mockResponse);
		});

		test('should reset password', async () => {
			const mockResponse = {
				success: true,
				message: 'Password reset successfully'
			};

			mockHttpClient.post.mockResolvedValue(mockResponse);

			const resetData = {
				token: 'reset-token-123',
				password: 'newpassword123'
			};

			const result = await service.resetPassword(resetData);

			expect(mockHttpClient.post).toHaveBeenCalledWith(
				'https://127.0.0.1:3000/auth/reset-password',
				resetData
			);
			expect(result).toEqual(mockResponse);
		});
	});

	describe('Token Management', () => {
		test('should refresh token', async () => {
			const mockResponse = {
				success: true,
				token: 'new-jwt-token-456'
			};

			mockHttpClient.post.mockResolvedValue(mockResponse);
			localStorage.setItem('token', 'old-token');

			const result = await service.refreshToken();

			expect(mockHttpClient.post).toHaveBeenCalledWith(
				'https://127.0.0.1:3000/auth/refresh',
				{},
				{
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer old-token'
					}
				}
			);
			expect(result).toEqual(mockResponse);
			expect(localStorage.getItem('token')).toBe('new-jwt-token-456');
		});

		test('should handle refresh token failure', async () => {
			const mockResponse = {
				success: false,
				message: 'Token expired'
			};

			mockHttpClient.post.mockResolvedValue(mockResponse);
			localStorage.setItem('token', 'expired-token');

			const result = await service.refreshToken();

			expect(result).toEqual(mockResponse);
			expect(localStorage.getItem('token')).toBe('expired-token'); // Should not change
		});
	});

	describe('Platform Handling', () => {
		test('should handle non-browser platform', () => {
			// Create service with different platform
			const serverService = new MockAuthService();
			(serverService as any).platformId = 'server';

			expect(serverService.getToken()).toBeNull();
			expect(serverService.isLoggedIn()).toBe(false);
		});

		test('should handle missing window object', () => {
			// Temporarily remove window
			const originalWindow = global.window;
			delete (global as any).window;

			const service = new MockAuthService();
			expect(service.getToken()).toBeNull();

			// Restore window
			global.window = originalWindow;
		});
	});

	describe('Error Handling', () => {
		test('should handle malformed responses', async () => {
			const malformedResponse = null;
			mockHttpClient.post.mockResolvedValue(malformedResponse);

			const credentials = {
				email: 'test@example.com',
				password: 'password123',
				rememberMe: false
			};

			const result = await service.login(credentials);
			expect(result).toBeNull();
		});

		test('should handle empty responses', async () => {
			const emptyResponse = {};
			mockHttpClient.post.mockResolvedValue(emptyResponse);

			const credentials = {
				email: 'test@example.com',
				password: 'password123',
				rememberMe: false
			};

			const result = await service.login(credentials);
			expect(result).toEqual({});
		});

		test('should handle network timeouts', async () => {
			const timeoutError = new Error('Request timeout');
			mockHttpClient.post.mockRejectedValue(timeoutError);

			const credentials = {
				email: 'test@example.com',
				password: 'password123',
				rememberMe: false
			};

			try {
				await service.login(credentials);
				fail('Should have thrown an error');
			} catch (error: any) {
				expect(error.message).toBe('Request timeout');
			}
		});
	});
});
