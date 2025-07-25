// src/app/app.routes.ts

import { Routes } from "@angular/router";
import { LoginComponent } from "./login/login.component";
import { RegisterComponent } from "./register/register.component";
import { DashboardComponent } from "./dashboard/dashboard.component";
import { FileBrowserComponent } from "./file-browser/file-browser.component";
import { StorageSetupInstructions } from "./storage-setup-instructions/storage-setup-instructions.component";
import { AuthGuard, GuestGuard } from "./auth.guard";

export const routes: Routes = [
	{
		path: "",
		redirectTo: "/login",
		pathMatch: "full",
	},
	{
		path: "login",
		component: LoginComponent,
		canActivate: [GuestGuard],
	},
	{
		path: "register",
		component: RegisterComponent,
		canActivate: [GuestGuard],
	},
	{
		path: "dashboard",
		component: DashboardComponent,
		canActivate: [AuthGuard],
	},
	{
		path: "file-browser/:nodeId",
		component: FileBrowserComponent,
		canActivate: [AuthGuard],
	},
	{
		path: "storage-setup-instructions",
		component: StorageSetupInstructions,
		canActivate: [AuthGuard],
	},
	{ path: "**", redirectTo: "/login" }, // Wildcard route for 404 errors
];
