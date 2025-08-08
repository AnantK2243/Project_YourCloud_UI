import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthGuard, GuestGuard } from './auth.guard';
import { AuthService } from './auth.service';

// Minimal AuthService stub that reads token from localStorage
const authStub: Pick<AuthService, 'isLoggedIn'> = {
	isLoggedIn: () => !!localStorage.getItem('token')
};

describe('Route Guards (integration)', () => {
	let router: Router;

	beforeEach(() => {
		// Reset storage between tests
		localStorage.removeItem('token');

		TestBed.configureTestingModule({
			imports: [RouterTestingModule.withRoutes([])],
			providers: [{ provide: AuthService, useValue: authStub }]
		});

		router = TestBed.inject(Router);
	});

	describe('AuthGuard', () => {
		it('allows when logged in', () => {
			const guard = TestBed.inject(AuthGuard);
			localStorage.setItem('token', 'test-token');
			const navigateSpy = vi.spyOn(router, 'navigate');
			const result = guard.canActivate({} as any, { url: '/dashboard' } as any);
			expect(result).toBe(true);
			expect(navigateSpy).not.toHaveBeenCalled();
		});

		it('redirects to login when not logged in', () => {
			const guard = TestBed.inject(AuthGuard);
			localStorage.removeItem('token');
			const navigateSpy = vi.spyOn(router, 'navigate');
			const result = guard.canActivate({} as any, { url: '/protected' } as any);
			expect(result).toBe(false);
			expect(navigateSpy).toHaveBeenCalled();
			const [commands, extras] = navigateSpy.mock.calls[0] as any;
			expect(commands).toEqual(['/login']);
			expect(extras).toBeDefined();
			expect(extras.queryParams?.['returnUrl']).toBe('/protected');
		});
	});

	describe('GuestGuard', () => {
		it('allows when not logged in', () => {
			const guard = TestBed.inject(GuestGuard);
			localStorage.removeItem('token');
			const navigateSpy = vi.spyOn(router, 'navigate');
			const result = guard.canActivate();
			expect(result).toBe(true);
			expect(navigateSpy).not.toHaveBeenCalled();
		});

		it('redirects to dashboard when logged in', () => {
			const guard = TestBed.inject(GuestGuard);
			localStorage.setItem('token', 'test');
			const navigateSpy = vi.spyOn(router, 'navigate');
			const result = guard.canActivate();
			expect(result).toBe(false);
			expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
		});
	});
});
