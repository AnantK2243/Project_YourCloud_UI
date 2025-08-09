// File: src/app/utils/component-utils.ts - Shared form, password, message and confirmation helpers

import { FormErrors } from './auth-utils';

// Form validation helper interface
export interface FormFieldHelpers {
	getFieldErrors(field: string, errors: FormErrors): string[];
	hasFieldError(
		field: string,
		errors: FormErrors,
		touched: { [key: string]: boolean },
		submitAttempted: boolean
	): boolean;
	isFormValid(
		errors: FormErrors,
		requiredFields: string[],
		formData: { [key: string]: any }
	): boolean;
}

// Get field errors for display
export function getFieldErrors(field: string, errors: FormErrors): string[] {
	// Return list of validation errors for a field
	return errors[field] || [];
}

// Check if field has errors
export function hasFieldError(
	field: string,
	errors: FormErrors,
	touched: { [key: string]: boolean },
	submitAttempted: boolean
): boolean {
	// True if field has errors and user interacted or tried submit
	return !!(errors[field] && errors[field].length > 0 && (touched[field] || submitAttempted));
}

// Check if form is valid
export function isFormValid(
	errors: FormErrors,
	requiredFields: string[],
	formData: { [key: string]: any }
): boolean {
	// Validate absence of errors and presence of required fields
	if (Object.keys(errors).length > 0) {
		return false;
	}
	return requiredFields.every(field => {
		const value = formData[field];
		return value && (typeof value === 'string' ? value.trim() : value);
	});
}

// Password strength utilities
export interface PasswordStrengthResult {
	// Password strength evaluation output
	strength: 'weak' | 'fair' | 'good' | 'strong';
	score: number;
	requirements: { text: string; met: boolean }[];
}

export function calculatePasswordStrength(password: string): PasswordStrengthResult {
	// Evaluate password and return composite strength result
	const requirements = [
		{ text: 'At least 8 characters', met: password.length >= 8 },
		{ text: 'Contains lowercase letter', met: /[a-z]/.test(password) },
		{ text: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
		{ text: 'Contains number', met: /\d/.test(password) },
		{
			text: 'Contains special character',
			met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
		}
	];

	const score = requirements.filter(req => req.met).length;

	let strength: 'weak' | 'fair' | 'good' | 'strong';
	if (score <= 2) {
		strength = 'weak';
	} else if (score === 3) {
		strength = 'fair';
	} else if (score === 4) {
		strength = 'good';
	} else {
		strength = 'strong';
	}

	return { strength, score, requirements };
}

export function getPasswordStrengthClass(strength: 'weak' | 'fair' | 'good' | 'strong'): string {
	// Map strength to tailwind classes
	const classMap = {
		weak: 'text-red-500 font-medium',
		fair: 'text-orange-500 font-medium',
		good: 'text-yellow-500 font-medium',
		strong: 'text-green-500 font-medium'
	};
	return classMap[strength];
}

export function getPasswordStrengthText(strength: 'weak' | 'fair' | 'good' | 'strong'): string {
	// Map strength to display label
	const strengthMap = {
		weak: 'Weak',
		fair: 'Fair',
		good: 'Good',
		strong: 'Strong'
	};
	return strengthMap[strength];
}

// Message management utilities
export interface MessageState {
	// Container for UX feedback messages
	error: string;
	warning: string;
	success?: string;
	info?: string;
}

export function clearMessages(messageState: MessageState): MessageState {
	// Reset all message fields
	return {
		...messageState,
		error: '',
		warning: '',
		success: '',
		info: ''
	};
}

export function setErrorMessage(messageState: MessageState, error: string): MessageState {
	// Set only error field resetting others
	return {
		...messageState,
		error,
		warning: '',
		success: '',
		info: ''
	};
}

export function setSuccessMessage(messageState: MessageState, success: string): MessageState {
	// Set only success field resetting others
	return {
		...messageState,
		error: '',
		warning: '',
		success,
		info: ''
	};
}

// Confirmation dialog utilities
export interface ConfirmationState {
	// Modal confirmation prompt state
	show: boolean;
	title: string;
	message: string;
	action: (() => void) | null;
}

export function createConfirmationState(
	title: string,
	message: string,
	action: () => void
): ConfirmationState {
	// Initialize state for confirmation prompt
	return {
		show: true,
		title,
		message,
		action
	};
}

export function clearConfirmationState(): ConfirmationState {
	// Return empty confirmation state
	return {
		show: false,
		title: '',
		message: '',
		action: null
	};
}
