// File: src/app/utils/form-field.component.ts - Reusable form input with error display implementing ControlValueAccessor

import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
	selector: 'app-form-field',
	standalone: true,
	imports: [CommonModule, FormsModule],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => FormFieldComponent),
			multi: true
		}
	],
	template: `
		<div>
			<label [for]="fieldId" *ngIf="label">{{ label }}:</label>
			<input
				[id]="fieldId"
				[name]="name"
				[type]="type"
				[placeholder]="placeholder"
				[required]="required"
				[class]="fieldClass"
				[value]="value"
				(input)="onInput($event)"
				(blur)="onBlur()"
				(focus)="onFocus()"
				[autocomplete]="autocomplete"
			/>
			<div *ngIf="showErrors">
				<div *ngFor="let error of errors">
					{{ error }}
				</div>
			</div>
		</div>
	`
})
export class FormFieldComponent implements ControlValueAccessor {
	// Optional label text
	@Input() label: string = '';
	// Field name attribute
	@Input() name: string = '';
	// Input type (text/password/email/etc)
	@Input() type: string = 'text';
	// Placeholder text
	@Input() placeholder: string = '';
	// Required flag
	@Input() required: boolean = false;
	// Validation error messages
	@Input() errors: string[] = [];
	// CSS class string for input
	@Input() fieldClass: string = '';
	// Autocomplete attribute
	@Input() autocomplete: string = '';

	@Output() fieldChange = new EventEmitter<string>(); // Emits on value change
	@Output() fieldBlur = new EventEmitter<void>(); // Emits on blur
	@Output() fieldFocus = new EventEmitter<void>(); // Emits on focus

	value: string = ''; // Internal value backing
	fieldId: string = ''; // Generated unique id

	private onChange = (value: string) => {}; // ControlValueAccessor change cb
	private onTouched = () => {}; // ControlValueAccessor touched cb

	constructor() {
		// Generate a unique id for label/input association
		this.fieldId = this.generateId();
	}

	get showErrors(): boolean {
		// Determine if errors should be displayed
		return this.errors.length > 0;
	}

	onInput(event: Event): void {
		// Handle input changes and propagate to parent
		const target = event.target as HTMLInputElement;
		this.value = target.value;
		this.onChange(this.value);
		this.fieldChange.emit(this.value);
	}

	onBlur(): void {
		// Mark field touched and emit blur
		this.onTouched();
		this.fieldBlur.emit();
	}

	onFocus(): void {
		// Emit focus event
		this.fieldFocus.emit();
	}

	// ControlValueAccessor implementation
	writeValue(value: string): void {
		// Write value from parent form
		this.value = value || '';
	}

	registerOnChange(fn: (value: string) => void): void {
		// Register change callback
		this.onChange = fn;
	}

	registerOnTouched(fn: () => void): void {
		// Register touched callback
		this.onTouched = fn;
	}

	private generateId(): string {
		// Generate a pseudo-random element id
		return `field-${Math.random().toString(36).substr(2, 9)}`;
	}
}
