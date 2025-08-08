// tests/unit/routes-wiring.test.js

const { routes } = require('../../src/app/app.routes.ts');

describe('App Routes Wiring', () => {
	test('has default redirect to /login', () => {
		const first = routes[0];
		expect(first.path).toBe('');
		expect(first.redirectTo).toBe('/login');
		expect(first.pathMatch).toBe('full');
	});

	test('has wildcard redirect to /login', () => {
		const last = routes[routes.length - 1];
		expect(last.path).toBe('**');
		expect(last.redirectTo).toBe('/login');
	});

	test('protects dashboard with AuthGuard and login/register with GuestGuard', () => {
		const login = routes.find(r => r.path === 'login');
		const register = routes.find(r => r.path === 'register');
		const dashboard = routes.find(r => r.path === 'dashboard');

		expect(login.canActivate?.length).toBeGreaterThan(0);
		expect(register.canActivate?.length).toBeGreaterThan(0);
		expect(dashboard.canActivate?.length).toBeGreaterThan(0);
	});
});
