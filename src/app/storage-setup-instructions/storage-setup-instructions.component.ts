// src/app/node-setup-tutorial/node-setup-tutorial.component.ts

import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";

@Component({
	selector: "app-node-setup-tutorial",
	standalone: true,
	imports: [CommonModule],
	templateUrl: "./storage-setup-instructions.component.html",
})
export class StorageSetupInstructions {
	constructor(private router: Router) {}

	goBackToDashboard(): void {
		this.router.navigate(["/dashboard"]);
	}
}
