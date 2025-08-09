// File: src/app/register/register.component.ts - User registration with validation & strength meter.

import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ValidationService, FormErrors } from '../validation.service';

import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import {
	getFieldErrors,
	hasFieldError,
	isFormValid,
	calculatePasswordStrength,
	getPasswordStrengthClass,
	getPasswordStrengthText
} from '../utils/component-utils';

@Component({
	selector: 'app-register',
	standalone: true,
	imports: [FormsModule],
	templateUrl: './register.component.html'
})
/** User registration component with validation + password strength UI. */
export class RegisterComponent implements OnDestroy {
	name: string = '';
	email: string = '';
	password: string = '';
	confirmPassword: string = '';

	// Form state
	errors: FormErrors = {};
	touched: { [key: string]: boolean } = {};
	isSubmitting: boolean = false;
	submitAttempted: boolean = false;

	// Success/error messages
	errorMessage: string = '';
	successMessage: string = '';

	// Password strength
	passwordStrength: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
	showPasswordRequirements: boolean = false;

	// Real-time validation
	private validationSubject = new Subject<{ field: string; value: string }>();

	constructor(
		private authService: AuthService,
		private router: Router,
		private validationService: ValidationService
	) {
		// Set up real-time validation with debouncing
		this.validationSubject
			.pipe(
				debounceTime(300),
				distinctUntilChanged(
					(prev, curr) => prev.field === curr.field && prev.value === curr.value
				)
			)
			.subscribe(({ field, value }) => {
				this.validateField(field, value);
			});
	}

	ngOnDestroy() {
		this.validationSubject.complete();
	}

	/** Debounced field change handler. */
	onFieldChange(field: string, value: string) {
		this.touched[field] = true;
		if (field === 'password') {
			this.passwordStrength = this.validationService.assessPasswordStrength(value);
			// Also validate confirm password when password changes
			if (this.confirmPassword) {
				this.validateField('confirmPassword', this.confirmPassword);
			}
		}
		this.validationSubject.next({ field, value });
	}

	/** Track field focus for password requirements. */
	onFieldFocus(field: string) {
		if (field === 'password') {
			this.showPasswordRequirements = true;
		}
	}

	/** Mark field blur and maybe hide requirements. */
	onFieldBlur(field: string) {
		this.touched[field] = true;
		if (field === 'password' && !this.password) {
			this.showPasswordRequirements = false;
		}
	}

	// Real-time field validation
	private validateField(field: string, value: string) {
		switch (field) {
			case 'name':
				const nameValidation = this.validationService.validateName(value);
				this.updateFieldError(
					'name',
					nameValidation.isValid ? null : nameValidation.message!
				);
				break;
			case 'email':
				const emailValidation = this.validationService.validateEmail(value);
				this.updateFieldError(
					'email',
					emailValidation.isValid ? null : emailValidation.message!
				);
				break;
			case 'password':
				const passwordValidation = this.validationService.validatePassword(value);
				this.updateFieldError(
					'password',
					passwordValidation.isValid ? null : passwordValidation.message!
				);
				break;
			case 'confirmPassword':
				const confirmValidation = this.validationService.validatePasswordConfirmation(
					this.password,
					value
				);
				this.updateFieldError(
					'confirmPassword',
					confirmValidation.isValid ? null : confirmValidation.message!
				);
				break;
		}
	}

	private updateFieldError(field: string, error: string | null) {
		if (error) {
			this.errors[field] = [error];
		} else {
			delete this.errors[field];
		}
	}

	/** CSS class for field validity. */
	getFieldClass(field: string): string {
		return this.validationService.getFieldValidationClass(
			field,
			this.errors,
			this.touched[field] || this.submitAttempted
		);
	}

	/** Field errors. */
	getFieldErrors(field: string): string[] {
		return getFieldErrors(field, this.errors);
	}

	/** True if field invalid. */
	hasFieldError(field: string): boolean {
		return hasFieldError(field, this.errors, this.touched, this.submitAttempted);
	}

	/** True if form valid. */
	isFormValid(): boolean {
		return isFormValid(this.errors, ['name', 'email', 'password', 'confirmPassword'], {
			name: this.name,
			email: this.email,
			password: this.password,
			confirmPassword: this.confirmPassword
		});
	}

	/** Attempt user registration. */
	onRegister() {
		this.submitAttempted = true;

		// Mark all fields as touched for validation display
		Object.keys({
			name: true,
			email: true,
			password: true,
			confirmPassword: true
		}).forEach(field => {
			this.touched[field] = true;
		});

		// Clear previous messages
		this.errorMessage = '';
		this.successMessage = '';

		// Sanitize inputs
		this.name = this.validationService.sanitizeInput(this.name);
		this.email = this.validationService.sanitizeInput(this.email);

		// Comprehensive validation
		const validation = this.validationService.validateRegistrationForm({
			name: this.name,
			email: this.email,
			password: this.password,
			confirmPassword: this.confirmPassword
		});

		if (!validation.isValid) {
			this.errors = validation.errors;
			this.errorMessage = 'Please fix the errors below and try again.';
			return;
		}

		// Check password strength
		if (this.passwordStrength === 'weak') {
			this.errorMessage = 'Please choose a stronger password for better security.';
			return;
		}

		this.isSubmitting = true;

		this.authService
			.register({
				name: this.name.trim(),
				email: this.email.toLowerCase().trim(),
				password: this.password
			})
			.subscribe({
				next: response => {
					this.isSubmitting = false;
					if (response.success) {
						this.successMessage =
							response.message || 'Registration successful! Redirecting to login...';
						this.errorMessage = '';

						// Clear form
						this.name = '';
						this.email = '';
						this.password = '';
						this.confirmPassword = '';
						this.errors = {};
						this.touched = {};

						// Navigate to login after successful registration
						this.router.navigate(['/login'], {
							queryParams: {
								message:
									'Registration successful! Please log in with your new account.'
							}
						});
					} else {
						this.errorMessage =
							response.message || 'Registration failed. Please try again.';
						this.successMessage = '';
					}
				},
				error: error => {
					this.isSubmitting = false;
					let errorMessage = '';
					if (error.error && error.error.message) {
						errorMessage = error.error.message;
					}
					if (!errorMessage && error.message) errorMessage = error.message;
					if (!errorMessage) {
						if (error.status === 409)
							errorMessage =
								'An account with this email already exists. Please use a different email or try logging in.';
						else if (error.status === 429)
							errorMessage =
								'Too many registration attempts. Please try again later.';
						else
							errorMessage =
								'Registration failed. Please check your connection and try again.';
					}
					this.errorMessage = errorMessage;
					this.successMessage = '';
				}
			});
	}

	/** Navigate to login page. */
	goToLogin() {
		this.router.navigate(['/login']);
	}

	/** Password strength CSS class. */
	getPasswordStrengthClass(): string {
		const result = calculatePasswordStrength(this.password);
		return getPasswordStrengthClass(result.strength);
	}

	/** Password strength text. */
	getPasswordStrengthText(): string {
		const result = calculatePasswordStrength(this.password);
		return getPasswordStrengthText(result.strength);
	}

	/** Password requirement list. */
	getPasswordRequirements(): { text: string; met: boolean }[] {
		const result = calculatePasswordStrength(this.password);
		return result.requirements;
	}
}
