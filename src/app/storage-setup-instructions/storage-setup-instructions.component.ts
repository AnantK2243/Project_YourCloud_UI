// src/app/node-setup-tutorial/node-setup-tutorial.component.ts

import { Component } from "@angular/core";

import { Router } from "@angular/router";

@Component({
	selector: "app-node-setup-tutorial",
	standalone: true,
	imports: [],
	templateUrl: "./storage-setup-instructions.component.html",
})
export class StorageSetupInstructions {
	constructor(private router: Router) {}

	goBackToDashboard(): void {
		this.router.navigate(["/dashboard"]);
	}
}
