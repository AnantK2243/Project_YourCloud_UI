// src/app/dashboard/dashboard.component.ts

import { Component, OnInit, Inject, PLATFORM_ID } from "@angular/core";
import { Router } from "@angular/router";
import { NodeService, StorageNode } from "../node.service";
import { AuthService } from "../auth.service";
import { SessionHandlerService } from "../session-handler.service";
import { CommonModule, isPlatformBrowser } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
	selector: "app-dashboarFd",
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: "./dashboard.component.html",
})
export class DashboardComponent implements OnInit {
	warning: string = "";
	error: string = "";
	loading: boolean = true;

	// Node registration popup
	showRegisterPopup: boolean = false;
	registerNodeName: string = "";
	registerMessage: string = "";
	registrationResult: any = null;

	userStorageNodes: StorageNode[] = [];
	private userStorageNodesSub: any;

	constructor(
		private nodeService: NodeService,
		private authService: AuthService,
		private router: Router,
		private sessionHandler: SessionHandlerService,
		@Inject(PLATFORM_ID) private platformId: Object
	) {}

	ngOnInit() {
		if (isPlatformBrowser(this.platformId)) {
			this.userStorageNodesSub =
				this.nodeService.userStorageNodes$.subscribe((nodes) => {
					this.userStorageNodes = nodes;
				});
			this.refreshStorageNodes();
		}
	}

	ngOnDestroy() {
		if (this.userStorageNodesSub) {
			this.userStorageNodesSub.unsubscribe();
		}
	}

	showNodeRegistrationPopup() {
		this.showRegisterPopup = true;
		this.registerNodeName = "";
		this.registerMessage = "";
		this.registrationResult = null;
	}

	hideNodeRegistrationPopup() {
		this.showRegisterPopup = false;
		this.registerNodeName = "";
		this.registerMessage = "";
		this.registrationResult = null;
	}

	async refreshStorageNodes() {
		this.loading = true;
		this.clearMessages();
		try {
			// Fetch user storage nodes
			const response: any = await this.nodeService.loadUserStorageNodes();
			if (!response.success) {
				this.error =
					response.message || "Failed to fetch storage nodes.";
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}
			this.error = error.message || "An unexpected error occurred";
		} finally {
			this.loading = false;
		}
	}

	// Register a new node
	async registerNode() {
		if (!this.registerNodeName.trim()) {
			this.registerMessage = "Please enter a valid Node Name";
			return;
		}

		try {
			this.registerMessage = "Registering node...";
			this.registrationResult = null;

			const response: any = await this.nodeService.registerNode(
				this.registerNodeName.trim()
			);

			if (response.success) {
				this.registrationResult = response.registration_result;
				this.registerMessage = "Node registered successfully!";

				this.refreshStorageNodes();
			} else {
				this.registerMessage =
					response.message || "Node registration failed";
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}

			this.registerMessage =
				error.message || "An unexpected error occurred";
		}
	}

	// Check the status of a node
	async checkNodeStatus(nodeId: string) {
		this.loading = true;
		this.clearMessages();
		if (!nodeId.trim()) {
			this.error = "Invalid Node ID provided for status check.";
			return;
		}

		// Retrieve the status of the node
		try {
			const response: any = await this.nodeService.updateNodeStatus(
				nodeId
			);

			if (!response.success) {
				this.error =
					response.error || "Failed to retrieve node status.";
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}
			this.error = error.message || "An unexpected error occurred";
		} finally {
			this.loading = false;
		}
	}

	async deleteNode(nodeId: string) {
		if (!nodeId.trim()) {
			this.error = "Invalid Node ID provided for deletion.";
			return;
		}

		// Confirm deletion
		if (
			!confirm(
				`Are you sure you want to delete "${nodeId}"? This action cannot be undone.`
			)
		) {
			return;
		}

		this.loading = true;
		this.clearMessages();

		try {
			const response: any = await this.nodeService.deleteStorageNode(
				nodeId
			);
			if (!response.success) {
				this.error = response.error || "Failed to delete storage node.";
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}
			this.error = error.message || "An unexpected error occurred";
		} finally {
			this.loading = false;
		}
	}

	logout() {
		this.authService.logout();
		this.router.navigate(["/login"]);
	}

	openFileBrowser(node: any) {
		this.router.navigate(["/file-browser", node.node_id], {
			queryParams: { nodeName: node.label },
		});
	}

	clearMessages() {
		this.warning = "";
		this.error = "";
	}
}
