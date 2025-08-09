// File: src/app/session-handler.service.ts - Session/auth error detection and enforced logout redirect.

import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
	providedIn: 'root'
})
/** Session/auth error detection and enforced logout + redirect. */
export class SessionHandlerService {
	constructor(
		private router: Router,
		private authService: AuthService
	) {}

	/**
	 * True if error likely represents auth/session failure (401/403 or keywords).
	 * @param error Arbitrary error object.
	 */
	isSessionError(error: any): boolean {
		if (!error) return false;

		const errorMessage = (error.message || '').toLowerCase();
		const errorStatus = error.status;

		// Check for common session expiration indicators
		return (
			errorMessage.includes('password') ||
			errorMessage.includes('unauthorized') ||
			errorMessage.includes('authentication') ||
			errorMessage.includes('session') ||
			errorMessage.includes('not authenticated') ||
			errorMessage.includes('token') ||
			errorStatus === 401 ||
			errorStatus === 403
		);
	}

	/**
	 * Logout and navigate to login with optional custom message.
	 * @param customMessage Message shown on login page.
	 */
	handleSessionExpired(customMessage?: string): void {
		// Clear any stored authentication data
		this.authService.logout();

		// Navigate to login with a message
		const message = customMessage || 'Your session has expired. Please log in again.';
		this.router.navigate(['/login'], {
			queryParams: { message }
		});
	}

	/**
	 * If error is session-related perform logout + redirect.
	 * @returns True if handled.
	 */
	checkAndHandleSessionError(error: any, customMessage?: string): boolean {
		if (this.isSessionError(error)) {
			this.handleSessionExpired(customMessage);
			return true;
		}
		return false;
	}
}
