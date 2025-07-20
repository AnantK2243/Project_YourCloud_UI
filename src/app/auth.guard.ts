// src/app/auth.guard.ts

import { Injectable, inject } from "@angular/core";
import {
	CanActivate,
	Router,
	ActivatedRouteSnapshot,
	RouterStateSnapshot,
} from "@angular/router";
import { AuthService } from "./auth.service";

@Injectable({
	providedIn: "root",
})
export class AuthGuard implements CanActivate {
	private authService = inject(AuthService);
	private router = inject(Router);

	canActivate(
		route: ActivatedRouteSnapshot,
		state: RouterStateSnapshot
	): boolean {
		if (this.authService.isLoggedIn()) {
			return true;
		} else {
			// Store the attempted URL for redirecting after login
			this.router.navigate(["/login"], {
				queryParams: {
					returnUrl: state.url,
					message: "Please log in to access this page",
				},
			});
			return false;
		}
	}
}

@Injectable({
	providedIn: "root",
})
export class GuestGuard implements CanActivate {
	private authService = inject(AuthService);
	private router = inject(Router);

	canActivate(): boolean {
		if (!this.authService.isLoggedIn()) {
			return true;
		} else {
			// User is already logged in, redirect to dashboard
			this.router.navigate(["/dashboard"]);
			return false;
		}
	}
}
