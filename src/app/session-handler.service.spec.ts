import { describe, it, expect, beforeEach } from 'vitest';
import { SessionHandlerService } from './session-handler.service';

class RouterStub {
	public lastNavigation: any = null;
	navigate(commands: any[], extras?: any) {
		this.lastNavigation = { commands, extras };
	}
}

class AuthServiceStub {
	public loggedOut = false;
	logout() {
		this.loggedOut = true;
	}
}

describe('SessionHandlerService', () => {
	let service: SessionHandlerService;
	let router: RouterStub;
	let auth: AuthServiceStub;

	beforeEach(() => {
		router = new RouterStub();
		auth = new AuthServiceStub();
		service = new SessionHandlerService(router as any, auth as any);
	});

	describe('isSessionError', () => {
		it('returns false for null/undefined', () => {
			expect(service.isSessionError(null)).toBe(false);
			expect(service.isSessionError(undefined as any)).toBe(false);
		});

		it('detects status codes 401/403', () => {
			expect(service.isSessionError({ status: 401 })).toBe(true);
			expect(service.isSessionError({ status: 403 })).toBe(true);
			expect(service.isSessionError({ status: 500 })).toBe(false);
		});

		it('detects common auth keywords in message', () => {
			expect(service.isSessionError({ message: 'Unauthorized' })).toBe(true);
			expect(service.isSessionError({ message: 'authentication failed' })).toBe(true);
			expect(service.isSessionError({ message: 'session expired' })).toBe(true);
			expect(service.isSessionError({ message: 'token invalid' })).toBe(true);
			expect(service.isSessionError({ message: 'random error' })).toBe(false);
		});
	});

	describe('handleSessionExpired', () => {
		it('logs out and navigates to login with default message', () => {
			service.handleSessionExpired();
			expect(auth.loggedOut).toBe(true);
			expect(router.lastNavigation?.commands).toEqual(['/login']);
			expect(router.lastNavigation?.extras?.queryParams?.message).toContain(
				'session has expired'
			);
		});

		it('uses custom message when provided', () => {
			service.handleSessionExpired('Please sign in again');
			expect(router.lastNavigation?.extras?.queryParams?.message).toBe(
				'Please sign in again'
			);
		});
	});

	describe('checkAndHandleSessionError', () => {
		it('handles when error is a session error', () => {
			const handled = service.checkAndHandleSessionError({ status: 401 }, 'login again');
			expect(handled).toBe(true);
			expect(auth.loggedOut).toBe(true);
			expect(router.lastNavigation?.commands).toEqual(['/login']);
		});

		it('returns false and does nothing when not a session error', () => {
			const handled = service.checkAndHandleSessionError({ status: 500 });
			expect(handled).toBe(false);
			expect(auth.loggedOut).toBe(false);
			expect(router.lastNavigation).toBeNull();
		});
	});
});
