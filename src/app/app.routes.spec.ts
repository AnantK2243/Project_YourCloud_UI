import { describe, it, expect } from 'vitest';
import { routes } from './app.routes';

describe('App Routes', () => {
	it('redirects "" to /login', () => {
		const first = routes[0];
		expect(first.path).toBe('');
		expect(first.redirectTo).toBe('/login');
		expect(first.pathMatch).toBe('full');
	});

	it('has wildcard redirect to /login', () => {
		const last = routes[routes.length - 1];
		expect(last.path).toBe('**');
		expect(last.redirectTo).toBe('/login');
	});

	it('guards are wired for login/register (Guest) and dashboard (Auth)', () => {
		const login = routes.find(r => r.path === 'login');
		const register = routes.find(r => r.path === 'register');
		const dashboard = routes.find(r => r.path === 'dashboard');

		expect(login?.canActivate?.length).toBeGreaterThan(0);
		expect(register?.canActivate?.length).toBeGreaterThan(0);
		expect(dashboard?.canActivate?.length).toBeGreaterThan(0);
	});
});
