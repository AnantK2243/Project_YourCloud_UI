// src/app/validation.service.ts

import { Injectable } from "@angular/core";

export interface ValidationResult {
	isValid: boolean;
	message?: string;
}

export interface FormErrors {
	[key: string]: string[];
}

@Injectable({
	providedIn: "root",
})
export class ValidationService {
	// Email validation with comprehensive checks
	validateEmail(email: string): ValidationResult {
		if (!email || email.trim().length === 0) {
			return { isValid: false, message: "Email is required" };
		}

		const trimmedEmail = email.trim();

		if (trimmedEmail.length > 254) {
			return {
				isValid: false,
				message: "Email is too long (max 254 characters)",
			};
		}

		// RFC 5322 compliant email regex (simplified but robust)
		const emailRegex =
			/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

		if (!emailRegex.test(trimmedEmail)) {
			return {
				isValid: false,
				message: "Please enter a valid email address",
			};
		}

		return { isValid: true };
	}

	// Password validation with detailed feedback
	validatePassword(password: string): ValidationResult {
		if (!password || password.length === 0) {
			return { isValid: false, message: "Password is required" };
		}

		const errors: string[] = [];

		if (password.length < 8) {
			errors.push("at least 8 characters");
		}

		if (password.length > 128) {
			errors.push("maximum 128 characters");
		}

		if (!/(?=.*[a-z])/.test(password)) {
			errors.push("at least one lowercase letter");
		}

		if (!/(?=.*[A-Z])/.test(password)) {
			errors.push("at least one uppercase letter");
		}

		if (!/(?=.*\d)/.test(password)) {
			errors.push("at least one number");
		}

		if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) {
			errors.push(
				"at least one special character (!@#$%^&*()_+-=[]{};':\"\\|,.<>/?)"
			);
		}

		// Check for common weak patterns
		if (/(.)\1{2,}/.test(password)) {
			errors.push("no more than 2 consecutive identical characters");
		}

		if (/123|abc|qwe|password|admin/i.test(password)) {
			errors.push(
				"no common weak patterns (123, abc, qwe, password, admin)"
			);
		}

		if (errors.length > 0) {
			return {
				isValid: false,
				message: `Password must contain: ${errors.join(", ")}`,
			};
		}

		return { isValid: true };
	}

	// Password strength assessment
	assessPasswordStrength(
		password: string
	): "weak" | "fair" | "good" | "strong" {
		if (!password) return "weak";

		let score = 0;

		// Length scoring
		if (password.length >= 8) score++;
		if (password.length >= 12) score++;
		if (password.length >= 16) score++;

		// Character variety scoring
		if (/[a-z]/.test(password)) score++;
		if (/[A-Z]/.test(password)) score++;
		if (/\d/.test(password)) score++;
		if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

		// Bonus for mixed case and numbers
		if (/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) score++;

		// Penalty for common patterns
		if (/(.)\1{2,}/.test(password)) score--;
		if (/123|abc|qwe|password|admin/i.test(password)) score -= 2;

		if (score <= 2) return "weak";
		if (score <= 4) return "fair";
		if (score <= 6) return "good";
		return "strong";
	}

	// Name validation
	validateName(name: string): ValidationResult {
		if (!name || name.trim().length === 0) {
			return { isValid: false, message: "Name is required" };
		}

		const trimmedName = name.trim();

		if (trimmedName.length < 2) {
			return {
				isValid: false,
				message: "Name must be at least 2 characters long",
			};
		}

		if (trimmedName.length > 50) {
			return {
				isValid: false,
				message: "Name must be less than 50 characters",
			};
		}

		// Allow letters, spaces, hyphens, and apostrophes
		if (!/^[a-zA-Z\s'\-\.]+$/.test(trimmedName)) {
			return {
				isValid: false,
				message:
					"Name can only contain letters, spaces, hyphens, apostrophes, and periods",
			};
		}

		// Check for suspicious patterns
		if (/\s{2,}/.test(trimmedName)) {
			return {
				isValid: false,
				message: "Name cannot contain multiple consecutive spaces",
			};
		}

		if (/^[\s'\-\.]|[\s'\-\.]$/.test(trimmedName)) {
			return {
				isValid: false,
				message:
					"Name cannot start or end with spaces, hyphens, apostrophes, or periods",
			};
		}

		return { isValid: true };
	}

	// Password confirmation validation
	validatePasswordConfirmation(
		password: string,
		confirmPassword: string
	): ValidationResult {
		if (!confirmPassword || confirmPassword.length === 0) {
			return { isValid: false, message: "Please confirm your password" };
		}

		if (password !== confirmPassword) {
			return { isValid: false, message: "Passwords do not match" };
		}

		return { isValid: true };
	}

	// Comprehensive form validation
	validateRegistrationForm(data: {
		name: string;
		email: string;
		password: string;
		confirmPassword: string;
	}): { isValid: boolean; errors: FormErrors } {
		const errors: FormErrors = {};

		const nameValidation = this.validateName(data.name);
		if (!nameValidation.isValid) {
			errors["name"] = [nameValidation.message!];
		}

		const emailValidation = this.validateEmail(data.email);
		if (!emailValidation.isValid) {
			errors["email"] = [emailValidation.message!];
		}

		const passwordValidation = this.validatePassword(data.password);
		if (!passwordValidation.isValid) {
			errors["password"] = [passwordValidation.message!];
		}

		const confirmPasswordValidation = this.validatePasswordConfirmation(
			data.password,
			data.confirmPassword
		);
		if (!confirmPasswordValidation.isValid) {
			errors["confirmPassword"] = [confirmPasswordValidation.message!];
		}

		return {
			isValid: Object.keys(errors).length === 0,
			errors,
		};
	}

	validateLoginForm(data: { email: string; password: string }): {
		isValid: boolean;
		errors: FormErrors;
	} {
		const errors: FormErrors = {};

		if (!data.email || data.email.trim().length === 0) {
			errors["email"] = ["Email is required"];
		} else {
			const emailValidation = this.validateEmail(data.email);
			if (!emailValidation.isValid) {
				errors["email"] = [emailValidation.message!];
			}
		}

		if (!data.password || data.password.length === 0) {
			errors["password"] = ["Password is required"];
		}

		return {
			isValid: Object.keys(errors).length === 0,
			errors,
		};
	}

	// Real-time validation for better UX
	getFieldValidationClass(
		fieldName: string,
		errors: FormErrors,
		touched: boolean
	): string {
		if (!touched) return "";
		return errors[fieldName] && errors[fieldName].length > 0
			? "invalid"
			: "valid";
	}

	// Sanitize input to prevent XSS
	sanitizeInput(input: string): string {
		if (!input) return "";
		return input
			.trim()
			.replace(/[<>]/g, "") // Remove angle brackets
			.replace(/javascript:/gi, "") // Remove javascript: protocol
			.replace(/on\w+=/gi, ""); // Remove event handlers
	}
}
