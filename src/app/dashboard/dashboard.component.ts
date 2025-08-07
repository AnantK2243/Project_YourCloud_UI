// src/app/dashboard/dashboard.component.ts

import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { NodeService, StorageNode } from '../node.service';
import { AuthService } from '../auth.service';
import { SessionHandlerService } from '../session-handler.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
	selector: 'app-dashboarFd',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
	warning: string = '';
	error: string = '';
	loading: boolean = true;
	userName: string | null = null;

	// Hamburger menu state
	isMenuOpen: boolean = false;

	// Node registration popup
	showRegisterPopup: boolean = false;
	registerNodeName: string = '';
	registerMessage: string = '';
	registrationResult: any = null;

	// Custom confirmation popup
	showConfirmPopup: boolean = false;
	confirmTitle: string = '';
	confirmMessage: string = '';
	confirmAction: (() => void) | null = null;

	userStorageNodes: StorageNode[] = [];
	private userStorageNodesSub: any;
	private statusUpdateInterval: any;
	private readonly STATUS_UPDATE_INTERVAL = 30000; // 30 seconds

	constructor(
		private nodeService: NodeService,
		private authService: AuthService,
		private router: Router,
		private sessionHandler: SessionHandlerService,
		@Inject(PLATFORM_ID) private platformId: Object
	) {}

	ngOnInit() {
		if (isPlatformBrowser(this.platformId)) {
			this.userName = this.authService.getUserName();
			this.userStorageNodesSub = this.nodeService.userStorageNodes$.subscribe(nodes => {
				this.userStorageNodes = nodes;
			});
			this.refreshStorageNodes();
			this.startStatusUpdateInterval();
		}
	}

	ngOnDestroy() {
		if (this.userStorageNodesSub) {
			this.userStorageNodesSub.unsubscribe();
		}
		this.stopStatusUpdateInterval();
	}

	showNodeRegistrationPopup() {
		this.showRegisterPopup = true;
		this.registerNodeName = '';
		this.registerMessage = '';
		this.registrationResult = null;
		this.isMenuOpen = false; // Close menu when opening popup
	}

	hideNodeRegistrationPopup() {
		this.showRegisterPopup = false;
		this.registerNodeName = '';
		this.registerMessage = '';
		this.registrationResult = null;
	}

	toggleMenu() {
		this.isMenuOpen = !this.isMenuOpen;
	}

	closeMenu() {
		this.isMenuOpen = false;
	}

	showConfirmation(title: string, message: string, action: () => void) {
		this.confirmTitle = title;
		this.confirmMessage = message;
		this.confirmAction = action;
		this.showConfirmPopup = true;
	}

	hideConfirmation() {
		this.showConfirmPopup = false;
		this.confirmTitle = '';
		this.confirmMessage = '';
		this.confirmAction = null;
	}

	confirmAndExecute() {
		if (this.confirmAction) {
			this.confirmAction();
		}
		this.hideConfirmation();
	}

	startStatusUpdateInterval() {
		// Guard against multiple intervals
		if (this.statusUpdateInterval) {
			return;
		}

		// Clear any existing interval
		this.stopStatusUpdateInterval();

		// Set up the interval to update node statuses
		this.statusUpdateInterval = setInterval(() => {
			this.updateAllNodeStatuses();
		}, this.STATUS_UPDATE_INTERVAL);
	}

	stopStatusUpdateInterval() {
		if (this.statusUpdateInterval) {
			clearInterval(this.statusUpdateInterval);
			this.statusUpdateInterval = null;
		}
	}

	async updateAllNodeStatuses() {
		// Only update if we have nodes and we're not currently loading
		if (this.userStorageNodes.length === 0 || this.loading) {
			return;
		}

		try {
			// Update all node statuses without showing loading state
			const updatePromises = this.userStorageNodes.map(node =>
				this.nodeService.updateNodeStatus(node.node_id)
			);

			await Promise.all(updatePromises);
		} catch (error: any) {
			// Silently handle errors for background updates
			console.warn('Background node status update failed:', error.message);

			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				this.stopStatusUpdateInterval(); // Stop updates if session expired
				return;
			}
		}
	}

	async refreshStorageNodes() {
		this.loading = true;
		this.clearMessages();
		try {
			// Fetch user storage nodes
			const response: any = await this.nodeService.loadUserStorageNodes();
			if (!response.success) {
				this.error = response.message || 'Failed to fetch storage nodes.';
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}
			this.error = error.message || 'An unexpected error occurred';
		} finally {
			this.loading = false;
		}
	}

	// Register a new node
	async registerNode() {
		if (!this.registerNodeName.trim()) {
			this.registerMessage = 'Please enter a valid Node Name';
			return;
		}

		try {
			this.registerMessage = 'Registering node...';
			this.registrationResult = null;

			const response: any = await this.nodeService.registerNode(this.registerNodeName.trim());

			if (response.success) {
				this.registrationResult = response.registration_result;
				this.registerMessage = 'Node registered successfully!';

				this.refreshStorageNodes();
			} else {
				this.registerMessage = response.message || 'Node registration failed';
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}

			this.registerMessage = error.message || 'An unexpected error occurred';
		}
	}

	// Check the status of a node
	async checkNodeStatus(nodeId: string) {
		this.loading = true;
		this.clearMessages();
		if (!nodeId.trim()) {
			this.error = 'Invalid Node ID provided for status check.';
			return;
		}

		// Retrieve the status of the node
		try {
			const response: any = await this.nodeService.updateNodeStatus(nodeId);

			if (!response.success) {
				this.error = response.error || 'Failed to retrieve node status.';
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}
			this.error = error.message || 'An unexpected error occurred';
		} finally {
			this.loading = false;
		}
	}

	async deleteNode(nodeId: string) {
		if (!nodeId.trim()) {
			this.error = 'Invalid Node ID provided for deletion.';
			return;
		}

		// Show custom confirmation dialog
		this.showConfirmation(
			'Delete Storage Node',
			`Are you sure you want to delete this node? This action cannot be undone.\n\nNode ID: ${nodeId}`,
			async () => {
				await this.performDeleteNode(nodeId);
			}
		);
	}

	async performDeleteNode(nodeId: string) {
		this.loading = true;
		this.clearMessages();

		try {
			const response: any = await this.nodeService.deleteStorageNode(nodeId);
			if (!response.success) {
				this.error = response.error || 'Failed to delete storage node.';
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}
			this.error = error.message || 'An unexpected error occurred';
		} finally {
			this.loading = false;
		}
	}

	logout() {
		// Show custom confirmation dialog
		this.showConfirmation(
			'Logout Confirmation',
			'Are you sure you want to logout? You will need to sign in again to access your dashboard.',
			() => {
				this.isMenuOpen = false;
				this.authService.logout();
				this.router.navigate(['/login']);
			}
		);
	}

	openFileBrowser(node: StorageNode) {
		this.router.navigate(['/file-browser', node.node_id], {
			queryParams: { nodeName: node.node_name }
		});
	}

	openStorageSetupInstructions() {
		this.router.navigate(['/storage-setup-instructions']);
	}

	clearMessages() {
		this.warning = '';
		this.error = '';
	}
}
