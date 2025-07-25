// src/app/utils/auth-utils.ts

export interface LoginData {
	email: string;
	password: string;
}

export interface FormErrors {
	[key: string]: string[];
}

// Token management utilities
export function setToken(token: string): void {
	if (typeof window !== 'undefined' && window.localStorage) {
		localStorage.setItem('token', token);
	}
}

export function getToken(): string | null {
	if (typeof window !== 'undefined' && window.localStorage) {
		return localStorage.getItem('token');
	}
	return null;
}

export function clearToken(): void {
	if (typeof window !== 'undefined' && window.localStorage) {
		localStorage.removeItem('token');
	}
}

export function isLoggedIn(): boolean {
	const token = getToken();
	return !!token;
}

// API URL generation
export function getApiUrl(): string {
	if (typeof window !== 'undefined' && window.location) {
		return `${window.location.origin}/api`;
	}
	return 'http://localhost/api';
}

// Authentication headers
export function getAuthHeaders(): { [key: string]: string } {
	const headers: { [key: string]: string } = {
		'Content-Type': 'application/json'
	};

	const token = getToken();
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	return headers;
}

// Form validation utilities
export function isFormValid(email: string, password: string, errors: FormErrors): boolean {
	const hasErrors = Object.keys(errors).length > 0;
	const hasRequiredFields = email.trim() !== '' && password.trim() !== '';
	return hasRequiredFields && !hasErrors;
}

export function hasFieldError(
	field: string,
	errors: FormErrors,
	touched: { [key: string]: boolean },
	submitAttempted: boolean
): boolean {
	return !!(errors[field] && (touched[field] || submitAttempted));
}

export function getFieldErrors(field: string, errors: FormErrors): string[] {
	return errors[field] || [];
}

// Error message extraction
export function extractErrorMessage(error: any): string {
	if (error?.error?.message) {
		return error.error.message;
	}
	if (error?.message) {
		return error.message;
	}
	return 'An unexpected error occurred';
}
