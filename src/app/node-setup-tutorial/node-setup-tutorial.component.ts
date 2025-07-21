// src/app/node-setup-tutorial/node-setup-tutorial.component.ts

import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";

@Component({
	selector: "app-node-setup-tutorial",
	standalone: true,
	imports: [CommonModule],
	templateUrl: "./node-setup-tutorial.component.html",
})
export class NodeSetupTutorialComponent {
	constructor(private router: Router) {}

	goBackToDashboard(): void {
		this.router.navigate(["/dashboard"]);
	}
}
