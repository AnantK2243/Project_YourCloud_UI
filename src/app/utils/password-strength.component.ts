// src/app/utils/password-strength.component.ts

import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
	selector: "app-password-strength",
	standalone: true,
	imports: [CommonModule],
	template: `
		<div *ngIf="password && showStrength">
			<div>Password strength: {{ strengthText }}</div>
			<div *ngIf="showRequirements">
				<div>Requirements:</div>
				<ul>
					<li
						*ngFor="let req of requirements"
						[style.color]="req.met ? 'green' : 'red'"
					>
						{{ req.text }} {{ req.met ? "✓" : "✗" }}
					</li>
				</ul>
			</div>
		</div>
	`,
})
export class PasswordStrengthComponent {
	@Input() password: string = "";
	@Input() showStrength: boolean = true;
	@Input() showRequirements: boolean = false;

	get strength(): "weak" | "fair" | "good" | "strong" {
		if (!this.password) return "weak";

		let score = 0;

		// Length scoring
		if (this.password.length >= 8) score++;
		if (this.password.length >= 12) score++;
		if (this.password.length >= 16) score++;

		// Character variety scoring
		if (/[a-z]/.test(this.password)) score++;
		if (/[A-Z]/.test(this.password)) score++;
		if (/\d/.test(this.password)) score++;
		if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(this.password))
			score++;

		// Bonus for mixed case and numbers
		if (/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(this.password)) score++;

		// Penalty for common patterns
		if (/(.)\1{2,}/.test(this.password)) score--;
		if (/123|abc|qwe|password|admin/i.test(this.password)) score -= 2;

		if (score <= 2) return "weak";
		if (score <= 4) return "fair";
		if (score <= 6) return "good";
		return "strong";
	}

	get strengthText(): string {
		const strengthMap = {
			weak: "Weak",
			fair: "Fair",
			good: "Good",
			strong: "Strong",
		};
		return strengthMap[this.strength];
	}

	get requirements(): { text: string; met: boolean }[] {
		return [
			{ text: "At least 8 characters", met: this.password.length >= 8 },
			{
				text: "Contains lowercase letter",
				met: /[a-z]/.test(this.password),
			},
			{
				text: "Contains uppercase letter",
				met: /[A-Z]/.test(this.password),
			},
			{ text: "Contains number", met: /\d/.test(this.password) },
			{
				text: "Contains special character",
				met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(
					this.password
				),
			},
		];
	}
}
