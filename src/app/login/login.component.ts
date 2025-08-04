// src/app/login/login.component.ts

import { Component, Inject, PLATFORM_ID, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../auth.service';
import { ValidationService, FormErrors } from '../validation.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
	selector: 'app-login',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './login.component.html'
})
export class LoginComponent implements OnInit, OnDestroy {
	email: string = '';
	password: string = '';

	// Form state
	errors: FormErrors = {};
	touched: { [key: string]: boolean } = {};
	isSubmitting: boolean = false;
	submitAttempted: boolean = false;

	// Messages
	errorMessage: string = '';
	successMessage: string = '';
	infoMessage: string = '';

	// Real-time validation
	private validationSubject = new Subject<{ field: string; value: string }>();

	constructor(
		private authService: AuthService,
		private router: Router,
		private route: ActivatedRoute,
		private validationService: ValidationService,
		@Inject(PLATFORM_ID) private platformId: Object
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

	ngOnInit() {
		// Check for message query parameter
		this.route.queryParams.subscribe(params => {
			if (params['message']) {
				this.infoMessage = params['message'];
				// Clear the query parameter from the URL
				this.router.navigate([], {
					relativeTo: this.route,
					queryParams: {},
					replaceUrl: true
				});
			}
		});
	}

	// Field event handlers
	onFieldChange(field: string, value: string) {
		this.touched[field] = true;
		this.validationSubject.next({ field, value });
	}

	onFieldBlur(field: string) {
		this.touched[field] = true;
	}

	// Real-time field validation
	private validateField(field: string, value: string) {
		switch (field) {
			case 'email':
				const emailValidation = this.validationService.validateEmail(value);
				this.updateFieldError(
					'email',
					emailValidation.isValid ? null : emailValidation.message!
				);
				break;
			case 'password':
				if (!value || value.length === 0) {
					this.updateFieldError('password', 'Password is required');
				} else {
					this.updateFieldError('password', null);
				}
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

	// Get CSS class for field validation
	getFieldClass(field: string): string {
		return this.validationService.getFieldValidationClass(
			field,
			this.errors,
			this.touched[field] || this.submitAttempted
		);
	}

	// Get field errors for display
	getFieldErrors(field: string): string[] {
		return this.errors[field] || [];
	}

	// Check if field has errors
	hasFieldError(field: string): boolean {
		return !!(
			this.errors[field] &&
			this.errors[field].length > 0 &&
			(this.touched[field] || this.submitAttempted)
		);
	}

	// Check if form is valid
	isFormValid(): boolean {
		return Object.keys(this.errors).length === 0 && !!this.email.trim() && !!this.password;
	}

	onLogin() {
		this.submitAttempted = true;

		// Mark all fields as touched for validation display
		Object.keys({ email: true, password: true }).forEach(field => {
			this.touched[field] = true;
		});

		// Clear messages when attempting login
		this.errorMessage = '';
		this.successMessage = '';
		this.infoMessage = '';

		// Sanitize inputs
		this.email = this.validationService.sanitizeInput(this.email);

		// Comprehensive validation
		const validation = this.validationService.validateLoginForm({
			email: this.email,
			password: this.password
		});

		if (!validation.isValid) {
			this.errors = validation.errors;
			this.errorMessage = 'Please fix the errors below and try again.';
			return;
		}

		this.isSubmitting = true;

		this.authService
			.login({
				email: this.email.toLowerCase().trim(),
				password: this.password
			})
			.subscribe({
				next: response => {
					this.isSubmitting = false;
					if (response.success) {
						// Use auth service to store token
						this.authService.setToken(response.token);
						this.successMessage = 'Login successful! Redirecting...';
						this.errorMessage = '';

						// Clear form
						this.email = '';
						this.password = '';
						this.errors = {};
						this.touched = {};

						// Navigate to main app after successful login
						this.router.navigate(['/dashboard']);
					} else {
						this.errorMessage =
							response.message || 'Login failed. Please check your credentials.';
						this.successMessage = '';
					}
				},
				error: error => {
					this.isSubmitting = false;

					// First check if the error response has a message from the API
					let errorMessage = '';

					if (error.error && error.error.message) {
						// Use the specific message from the API response
						errorMessage = error.error.message;
					} else if (error.message) {
						// Fallback to error.message if available
						errorMessage = error.message;
					} else {
						// Handle specific error cases by status code as fallback
						if (error.status === 401) {
							errorMessage = 'Invalid email or password. Please try again.';
						} else if (error.status === 429) {
							errorMessage = 'Too many login attempts. Please try again later.';
						} else if (error.status === 422) {
							errorMessage = 'Invalid login data. Please check your information.';
						} else {
							errorMessage =
								'Login failed. Please check your connection and try again.';
						}
					}

					this.errorMessage = errorMessage;
					this.successMessage = '';
				}
			});
	}

	goToRegister() {
		this.router.navigate(['/register']);
	}
}
