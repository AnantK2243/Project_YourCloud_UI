// File: src/app/app.component.ts - Root application shell component.

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { FormsModule } from '@angular/forms';

@Component({
	selector: 'app-root',
	imports: [RouterOutlet, FormsModule],
	templateUrl: './app.component.html'
})
/** Root application shell. */
export class AppComponent {
	title = 'Project_YourCloud_UI';
}
