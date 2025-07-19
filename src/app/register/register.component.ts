// src/app/register/register.component.ts

import { Component } from "@angular/core";
import { Router } from "@angular/router";
import { AuthService } from "../auth.service";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
	selector: "app-register",
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: "./register.component.html",
})
export class RegisterComponent {
	name: string = "";
	email: string = "";
	password: string = "";
	confirmPassword: string = "";
	errorMessage: string = "";
	successMessage: string = "";

	constructor(private authService: AuthService, private router: Router) {}

	// Email validation
	private isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	// Strong password validation
	private isStrongPassword(password: string): boolean {
		return (
			password.length >= 8 &&
			/(?=.*[a-z])/.test(password) &&
			/(?=.*[A-Z])/.test(password) &&
			/(?=.*\d)/.test(password)
		);
	}

	onRegister() {
		// Clear previous messages
		this.errorMessage = "";
		this.successMessage = "";

		if (
			!this.name ||
			!this.email ||
			!this.password ||
			!this.confirmPassword
		) {
			this.errorMessage = "Please fill in all fields";
			return;
		}

		// Enhanced validation
		if (this.name.length < 2 || this.name.length > 50) {
			this.errorMessage = "Name must be between 2 and 50 characters";
			return;
		}

		if (!/^[a-zA-Z\s'-]+$/.test(this.name)) {
			this.errorMessage = "Name contains invalid characters";
			return;
		}

		if (!this.isValidEmail(this.email)) {
			this.errorMessage = "Please enter a valid email address";
			return;
		}

		if (this.password !== this.confirmPassword) {
			this.errorMessage = "Passwords do not match";
			return;
		}

		if (!this.isStrongPassword(this.password)) {
			this.errorMessage =
				"Password must be at least 8 characters and contain uppercase, lowercase, and numeric characters";
			return;
		}

		this.authService
			.register({
				name: this.name,
				email: this.email,
				password: this.password,
			})
			.subscribe({
				next: (response) => {
					if (response.success) {
						this.successMessage =
							"Registration successful! You can now login.";
						this.errorMessage = "";
						// Navigate to login after successful registration
						setTimeout(() => {
							this.router.navigate(["/login"]);
						}, 200);
					} else {
						this.errorMessage =
							response.message || "Registration failed";
						this.successMessage = "";
					}
				},
				error: (error) => {
					this.errorMessage =
						error.error?.message || "Registration failed";
					this.successMessage = "";
				},
			});
	}

	goToLogin() {
		this.router.navigate(["/login"]);
	}
}
