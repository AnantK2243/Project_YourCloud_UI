// File: src/app/utils/password-strength.component.spec.ts - Tests PasswordStrengthComponent display logic
import { TestBed } from '@angular/core/testing';
import { PasswordStrengthComponent } from './password-strength.component';

describe('PasswordStrengthComponent', () => {
	// Suite: verifies render & computed strength
	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [PasswordStrengthComponent]
		}).compileComponents();
	});

	it('computes strength', () => {
		const fixture = TestBed.createComponent(PasswordStrengthComponent);
		const cmp = fixture.componentInstance;
		cmp.password = 'Aa1!good';
		fixture.detectChanges();
		expect(['fair', 'good', 'strong']).toContain(cmp.strength);
	});
});
