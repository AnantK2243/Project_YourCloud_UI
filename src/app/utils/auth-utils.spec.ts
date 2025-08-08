import {
	setToken,
	getToken,
	clearToken,
	isLoggedIn,
	getApiUrl,
	getAuthHeaders,
	extractErrorMessage
} from './auth-utils';

describe('auth-utils', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('manages token in localStorage', () => {
		expect(getToken()).toBeNull();
		expect(isLoggedIn()).toBe(false);

		setToken('abc');
		expect(getToken()).toBe('abc');
		expect(isLoggedIn()).toBe(true);

		clearToken();
		expect(getToken()).toBeNull();
		expect(isLoggedIn()).toBe(false);
	});

	it('builds API url and headers', () => {
		const url = getApiUrl();
		expect(url).toMatch(/\/api$/);

		// No token
		let headers = getAuthHeaders();
		expect(headers['Content-Type']).toBe('application/json');
		expect(headers['Authorization']).toBeUndefined();

		// With token
		setToken('token123');
		headers = getAuthHeaders();
		expect(headers['Authorization']).toBe('Bearer token123');
	});

	it('extracts error messages', () => {
		expect(extractErrorMessage({ error: { message: 'bad' } })).toBe('bad');
		expect(extractErrorMessage({ message: 'oops' })).toBe('oops');
		expect(extractErrorMessage(null as any)).toMatch(/unexpected/);
	});
});
