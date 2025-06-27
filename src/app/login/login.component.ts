// src/app/login/login.component.ts

import { Component, Inject, PLATFORM_ID, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  email: string = '';
  password: string = '';
  errorMessage: string = '';
  successMessage: string = '';
  infoMessage: string = '';
  isSubmitting: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

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

  onLogin() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Please fill in all fields';
      return;
    }

    // Clear messages when attempting login
    this.errorMessage = '';
    this.successMessage = '';
    this.infoMessage = '';
    this.isSubmitting = true;

    this.authService
      .login({ 
        email: this.email.toLowerCase().trim(), 
        password: this.password 
      })
      .subscribe({
        next: (response) => {
          this.isSubmitting = false;
          if (response.success) {
            // Use auth service to store token
            this.authService.setToken(response.token);
            this.successMessage = 'Login successful!';
            this.errorMessage = '';
            // Navigate to main app after successful login
            setTimeout(() => {
              this.router.navigate(['/dashboard']);
            }, 200);
          } else {
            this.errorMessage = response.message || 'Login failed';
            this.successMessage = '';
          }
        },
        error: (error) => {
          this.isSubmitting = false;
          this.errorMessage = error.error?.message || 'Login failed';
          this.successMessage = '';
        },
      });
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }
}
