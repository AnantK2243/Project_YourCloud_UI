// src/app/utils/form-field.component.ts

import {
	Component,
	Input,
	Output,
	EventEmitter,
	forwardRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import {
	FormsModule,
	ControlValueAccessor,
	NG_VALUE_ACCESSOR,
} from "@angular/forms";

@Component({
	selector: "app-form-field",
	standalone: true,
	imports: [CommonModule, FormsModule],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => FormFieldComponent),
			multi: true,
		},
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
	`,
})
export class FormFieldComponent implements ControlValueAccessor {
	@Input() label: string = "";
	@Input() name: string = "";
	@Input() type: string = "text";
	@Input() placeholder: string = "";
	@Input() required: boolean = false;
	@Input() errors: string[] = [];
	@Input() fieldClass: string = "";
	@Input() autocomplete: string = "";

	@Output() fieldChange = new EventEmitter<string>();
	@Output() fieldBlur = new EventEmitter<void>();
	@Output() fieldFocus = new EventEmitter<void>();

	value: string = "";
	fieldId: string = "";

	private onChange = (value: string) => {};
	private onTouched = () => {};

	constructor() {
		this.fieldId = this.generateId();
	}

	get showErrors(): boolean {
		return this.errors.length > 0;
	}

	onInput(event: Event): void {
		const target = event.target as HTMLInputElement;
		this.value = target.value;
		this.onChange(this.value);
		this.fieldChange.emit(this.value);
	}

	onBlur(): void {
		this.onTouched();
		this.fieldBlur.emit();
	}

	onFocus(): void {
		this.fieldFocus.emit();
	}

	// ControlValueAccessor implementation
	writeValue(value: string): void {
		this.value = value || "";
	}

	registerOnChange(fn: (value: string) => void): void {
		this.onChange = fn;
	}

	registerOnTouched(fn: () => void): void {
		this.onTouched = fn;
	}

	private generateId(): string {
		return `field-${Math.random().toString(36).substr(2, 9)}`;
	}
}
