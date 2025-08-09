// File: src/app/utils/component-utils.spec.ts - Tests form/message helper utilities
import {
	getFieldErrors,
	hasFieldError,
	isFormValid,
	calculatePasswordStrength,
	getPasswordStrengthClass,
	getPasswordStrengthText,
	clearMessages,
	setErrorMessage,
	setSuccessMessage,
	createConfirmationState,
	clearConfirmationState,
	type MessageState
} from './component-utils';

describe('component-utils', () => {
	// Suite: validates form state helpers & message state transitions
	describe('form helpers', () => {
		it('getFieldErrors returns array or empty', () => {
			const errors = { email: ['Invalid'], password: [] } as any;
			expect(getFieldErrors('email', errors)).toEqual(['Invalid']);
			expect(getFieldErrors('missing', errors)).toEqual([]);
		});

		it('hasFieldError respects touched and submitAttempted', () => {
			const errors = { email: ['Required'] } as any;
			const touched = { email: false };
			expect(hasFieldError('email', errors, touched, false)).toBe(false);
			expect(hasFieldError('email', errors, { email: true }, false)).toBe(true);
			expect(hasFieldError('email', errors, touched, true)).toBe(true);
		});

		it('isFormValid checks errors and required fields', () => {
			const errorsNone = {} as any;
			const required = ['email', 'password'];
			const dataMissing = { email: 'a@b.com', password: '' } as any;
			const dataValid = { email: 'a@b.com', password: 'secret' } as any;

			expect(isFormValid({ any: ['err'] } as any, required, dataValid)).toBe(false);
			expect(isFormValid(errorsNone, required, dataMissing)).toBe(false);
			expect(isFormValid(errorsNone, required, dataValid)).toBe(true);
		});
	});

	describe('password strength', () => {
		it('calculates strength and requirements', () => {
			const weak = calculatePasswordStrength('a');
			expect(weak.strength).toBe('weak');
			expect(weak.score).toBeLessThanOrEqual(2);

			const good = calculatePasswordStrength('Abcd1234');
			expect(['fair', 'good']).toContain(good.strength);
			expect(good.score).toBeGreaterThanOrEqual(3);

			const strong = calculatePasswordStrength('Abcd1234!');
			expect(strong.strength).toBe('strong');
			expect(strong.score).toBe(5);
			expect(strong.requirements.length).toBe(5);
		});

		it('maps strength to class and text', () => {
			expect(getPasswordStrengthClass('weak')).toMatch(/red/);
			expect(getPasswordStrengthClass('strong')).toMatch(/green/);
			expect(getPasswordStrengthText('good')).toBe('Good');
		});
	});

	describe('message helpers', () => {
		const base: MessageState = { error: 'e', warning: 'w', success: 's', info: 'i' };

		it('clearMessages clears all fields', () => {
			const cleared = clearMessages(base);
			expect(cleared).toEqual({ error: '', warning: '', success: '', info: '' });
		});

		it('setErrorMessage sets error and clears others', () => {
			const res = setErrorMessage(base, 'oops');
			expect(res).toEqual({ error: 'oops', warning: '', success: '', info: '' });
		});

		it('setSuccessMessage sets success and clears others', () => {
			const res = setSuccessMessage(base, 'ok');
			expect(res).toEqual({ error: '', warning: '', success: 'ok', info: '' });
		});
	});

	describe('confirmation helpers', () => {
		it('create and clear confirmation state', () => {
			const action = vi.fn();
			const state = createConfirmationState('Title', 'Msg', action);
			expect(state).toMatchObject({ show: true, title: 'Title', message: 'Msg' });
			expect(state.action).toBe(action);

			const cleared = clearConfirmationState();
			expect(cleared).toEqual({ show: false, title: '', message: '', action: null });
		});
	});
});
