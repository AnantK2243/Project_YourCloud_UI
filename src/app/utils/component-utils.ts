// src/app/utils/component-utils.ts

import { FormErrors } from './auth-utils';

// Form validation helper functions that can be shared across components
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
	return errors[field] || [];
}

// Check if field has errors
export function hasFieldError(
	field: string,
	errors: FormErrors,
	touched: { [key: string]: boolean },
	submitAttempted: boolean
): boolean {
	return !!(errors[field] && errors[field].length > 0 && (touched[field] || submitAttempted));
}

// Check if form is valid
export function isFormValid(
	errors: FormErrors,
	requiredFields: string[],
	formData: { [key: string]: any }
): boolean {
	// Check for errors
	if (Object.keys(errors).length > 0) {
		return false;
	}

	// Check required fields are filled
	return requiredFields.every(field => {
		const value = formData[field];
		return value && (typeof value === 'string' ? value.trim() : value);
	});
}

// Password strength utilities
export interface PasswordStrengthResult {
	strength: 'weak' | 'fair' | 'good' | 'strong';
	score: number;
	requirements: { text: string; met: boolean }[];
}

export function calculatePasswordStrength(password: string): PasswordStrengthResult {
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
	const classMap = {
		weak: 'text-red-500 font-medium',
		fair: 'text-orange-500 font-medium',
		good: 'text-yellow-500 font-medium',
		strong: 'text-green-500 font-medium'
	};
	return classMap[strength];
}

export function getPasswordStrengthText(strength: 'weak' | 'fair' | 'good' | 'strong'): string {
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
	error: string;
	warning: string;
	success?: string;
	info?: string;
}

export function clearMessages(messageState: MessageState): MessageState {
	return {
		...messageState,
		error: '',
		warning: '',
		success: '',
		info: ''
	};
}

export function setErrorMessage(messageState: MessageState, error: string): MessageState {
	return {
		...messageState,
		error,
		warning: '',
		success: '',
		info: ''
	};
}

export function setSuccessMessage(messageState: MessageState, success: string): MessageState {
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
	return {
		show: true,
		title,
		message,
		action
	};
}

export function clearConfirmationState(): ConfirmationState {
	return {
		show: false,
		title: '',
		message: '',
		action: null
	};
}
