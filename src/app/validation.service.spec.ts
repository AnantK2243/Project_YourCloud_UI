// File: src/app/validation.service.spec.ts - Tests ValidationService input validation helpers
import { ValidationService } from './validation.service';

describe('ValidationService', () => {
	// Suite: basic validity, strength & name rules
	let service: ValidationService;

	beforeEach(() => {
		service = new ValidationService();
	});

	it('validates emails', () => {
		expect(service.validateEmail('user@example.com').isValid).toBe(true);
		expect(service.validateEmail('bad').isValid).toBe(false);
	});

	it('validates passwords', () => {
		const good = 'Aa1!bcdE';
		expect(service.validatePassword(good).isValid).toBe(true);
		expect(service.validatePassword('short').isValid).toBe(false);
	});

	it('assesses password strength', () => {
		expect(service.assessPasswordStrength('weak')).toBe('weak');
		expect(service.assessPasswordStrength('Aa1!bcdE')).toMatch(/fair|good|strong/);
	});

	it('validates names', () => {
		expect(service.validateName('John Doe').isValid).toBe(true);
		expect(service.validateName('')).toEqual({ isValid: false, message: 'Name is required' });
	});
});
