// File: src/app/utils/auth-utils.ts - Lightweight auth token and header helpers

export interface LoginData {
	// Login form credentials
	email: string;
	password: string;
}

export interface FormErrors {
	// Map of field -> list of error messages
	[key: string]: string[];
}

// Token management utilities
export function setToken(token: string): void {
	// Persist auth token in localStorage
	if (typeof window !== 'undefined' && window.localStorage) {
		localStorage.setItem('token', token);
	}
}

export function getToken(): string | null {
	// Retrieve auth token from storage
	if (typeof window !== 'undefined' && window.localStorage) {
		return localStorage.getItem('token');
	}
	return null;
}

export function clearToken(): void {
	// Remove auth token
	if (typeof window !== 'undefined' && window.localStorage) {
		localStorage.removeItem('token');
	}
}

export function isLoggedIn(): boolean {
	// Boolean convenience for token presence
	const token = getToken();
	return !!token;
}

// API URL generation
export function getApiUrl(): string {
	// Build base API URL from current origin
	if (typeof window !== 'undefined' && window.location) {
		return `${window.location.origin}/api`;
	}
	return 'http://localhost/api';
}

// Authentication headers
export function getAuthHeaders(): { [key: string]: string } {
	// Compose JSON + optional Authorization header
	const headers: { [key: string]: string } = {
		'Content-Type': 'application/json'
	};

	const token = getToken();
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	return headers;
}

// Error message extraction
export function extractErrorMessage(error: any): string {
	// Normalize API / network error shapes to a message
	if (error?.error?.message) {
		return error.error.message;
	}
	if (error?.message) {
		return error.message;
	}
	return 'An unexpected error occurred';
}
