import { TestBed } from '@angular/core/testing';
import { FormFieldComponent } from './form-field.component';

describe('FormFieldComponent', () => {
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
