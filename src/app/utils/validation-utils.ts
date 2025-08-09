// File: src/app/utils/validation-utils.ts - Field, credential and form validation helpers

export interface ValidationResult {
	// Basic validation result structure
	isValid: boolean;
	message?: string;
}

// Email validation
export function validateEmail(email: string): ValidationResult {
	// Validate email format, length and presence
	if (!email || email.trim() === '') {
		return { isValid: false, message: 'Email is required' };
	}

	if (email.length > 254) {
		return { isValid: false, message: 'Email is too long (max 254 characters)' };
	}

	// More comprehensive email regex
	const emailRegex =
		/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

	if (!emailRegex.test(email)) {
		return { isValid: false, message: 'Please enter a valid email address' };
	}

	return { isValid: true };
}

// Password strength validation
export function validatePasswordStrength(password: string): ValidationResult {
	// Enforce length, case, number and special char requirements
	if (!password || password.trim() === '') {
		return { isValid: false, message: 'Password is required' };
	}

	if (password.length < 8) {
		return { isValid: false, message: 'Password must be at least 8 characters long' };
	}

	// Check for at least one uppercase letter
	if (!/[A-Z]/.test(password)) {
		return { isValid: false, message: 'Password must contain at least one uppercase letter' };
	}

	// Check for at least one lowercase letter
	if (!/[a-z]/.test(password)) {
		return { isValid: false, message: 'Password must contain at least one lowercase letter' };
	}

	// Check for at least one number
	if (!/\d/.test(password)) {
		return { isValid: false, message: 'Password must contain at least one number' };
	}

	// Check for at least one special character
	if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
		return { isValid: false, message: 'Password must contain at least one special character' };
	}

	return { isValid: true };
}

// Name validation
export function validateName(name: string): ValidationResult {
	// Validate display name length and character set
	if (!name || name.trim() === '') {
		return { isValid: false, message: 'Name is required' };
	}

	const trimmedName = name.trim();

	if (trimmedName.length < 2) {
		return { isValid: false, message: 'Name must be at least 2 characters long' };
	}

	if (trimmedName.length > 100) {
		return { isValid: false, message: 'Name is too long (max 100 characters)' };
	}

	// Check for valid name characters (letters, spaces, hyphens, apostrophes, and some unicode)
	const nameRegex = /^[a-zA-Z\u00C0-\u017F\u0400-\u04FF\u4e00-\u9fff\s'-]+$/;

	if (!nameRegex.test(trimmedName)) {
		return { isValid: false, message: 'Name contains invalid characters' };
	}

	return { isValid: true };
}

// Simple email validation (boolean only)
export function isValidEmail(email: string): boolean {
	return validateEmail(email).isValid;
}

// Simple password validation (boolean only)
export function isStrongPassword(password: string): boolean {
	return validatePasswordStrength(password).isValid;
}

// Simple name validation (boolean only)
export function isValidName(name: string): boolean {
	return validateName(name).isValid;
}

// Input sanitization
export function sanitizeInput(input: string): string {
	// Trim, collapse spaces and cap length
	if (!input) return '';

	return input.trim().replace(/\s+/g, ' ').substring(0, 1000); // Limit length to prevent abuse
}

// Form validation for login
export interface LoginForm {
	// Login form shape
	email: string;
	password: string;
}

export function validateLoginForm(form: LoginForm): {
	isValid: boolean;
	errors: { [key: string]: string[] };
} {
	// Validate login form returning error map
	const errors: { [key: string]: string[] } = {};

	// Validate email
	const emailResult = validateEmail(form.email);
	if (!emailResult.isValid && emailResult.message) {
		errors['email'] = [emailResult.message];
	}

	// Validate password (basic check for login - just required)
	if (!form.password || form.password.trim() === '') {
		errors['password'] = ['Password is required'];
	}

	return {
		isValid: Object.keys(errors).length === 0,
		errors
	};
}

// Form validation for registration
export interface RegisterForm {
	// Registration form shape
	name: string;
	email: string;
	password: string;
	confirmPassword: string;
}

export function validateRegisterForm(form: RegisterForm): {
	isValid: boolean;
	errors: { [key: string]: string[] };
} {
	// Validate registration form structure and matching passwords
	const errors: { [key: string]: string[] } = {};

	// Validate name
	const nameResult = validateName(form.name);
	if (!nameResult.isValid && nameResult.message) {
		errors['name'] = [nameResult.message];
	}

	// Validate email
	const emailResult = validateEmail(form.email);
	if (!emailResult.isValid && emailResult.message) {
		errors['email'] = [emailResult.message];
	}

	// Validate password
	const passwordResult = validatePasswordStrength(form.password);
	if (!passwordResult.isValid && passwordResult.message) {
		errors['password'] = [passwordResult.message];
	}

	// Validate password confirmation
	if (!form.confirmPassword || form.confirmPassword.trim() === '') {
		errors['confirmPassword'] = ['Please confirm your password'];
	} else if (form.password !== form.confirmPassword) {
		errors['confirmPassword'] = ['Passwords do not match'];
	}

	return {
		isValid: Object.keys(errors).length === 0,
		errors
	};
}

// Field validation class helper
export function getFieldValidationClass(
	field: string,
	errors: { [key: string]: string[] },
	touched: boolean
): string {
	// Return CSS class based on field validation state
	if (!touched) {
		return 'border-white/30 focus:border-white/50';
	}

	const hasError = errors[field] && errors[field].length > 0;
	if (hasError) {
		return 'border-red-300 focus:border-red-500 focus:ring-red-500';
	}

	return 'border-green-300 focus:border-green-500 focus:ring-green-500';
}
