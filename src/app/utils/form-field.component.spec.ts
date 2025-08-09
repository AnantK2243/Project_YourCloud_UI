// File: src/app/utils/form-field.component.spec.ts - Tests FormFieldComponent value binding and change emission
import { TestBed } from '@angular/core/testing';
import { FormFieldComponent } from './form-field.component';

describe('FormFieldComponent', () => {
	// Suite: ensures input change updates component value
	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [FormFieldComponent]
		}).compileComponents();
	});

	it('emits changes', () => {
		const fixture = TestBed.createComponent(FormFieldComponent);
		fixture.componentInstance.name = 'email';
		fixture.detectChanges();

		const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
		input.value = 'test';
		input.dispatchEvent(new Event('input'));
		fixture.detectChanges();

		expect(fixture.componentInstance.value).toBe('test');
	});
});
