// File: src/app/dashboard/dashboard.component.ts - User dashboard for node management & navigation.

import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { NodeService, StorageNode } from '../node.service';
import { AuthService } from '../auth.service';
import { SessionHandlerService } from '../session-handler.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
	MessageState,
	ConfirmationState,
	clearMessages as clearMessageState,
	setErrorMessage,
	createConfirmationState,
	clearConfirmationState
} from '../utils/component-utils';
import { validateNodeName } from '../utils/node-utils';

@Component({
	selector: 'app-dashboard',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './dashboard.component.html'
})
/** User dashboard: manage storage nodes, status polling, and navigation. */
export class DashboardComponent implements OnInit {
	// Message state
	messageState: MessageState = {
		warning: '',
		error: ''
	};

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
	confirmationState: ConfirmationState = clearConfirmationState();

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

	/** Open node registration popup. */
	showNodeRegistrationPopup() {
		this.showRegisterPopup = true;
		this.registerNodeName = '';
		this.registerMessage = '';
		this.registrationResult = null;
		this.isMenuOpen = false; // Close menu when opening popup
	}

	/** Hide node registration popup. */
	hideNodeRegistrationPopup() {
		this.showRegisterPopup = false;
		this.registerNodeName = '';
		this.registerMessage = '';
		this.registrationResult = null;
	}

	/** Toggle hamburger menu. */
	toggleMenu() {
		this.isMenuOpen = !this.isMenuOpen;
	}

	/** Close hamburger menu. */
	closeMenu() {
		this.isMenuOpen = false;
	}

	/** Show generic confirmation dialog. */
	showConfirmation(title: string, message: string, action: () => void) {
		this.confirmationState = createConfirmationState(title, message, action);
	}

	/** Hide confirmation dialog. */
	hideConfirmation() {
		this.confirmationState = clearConfirmationState();
	}

	/** Execute stored confirm action. */
	confirmAndExecute() {
		if (this.confirmationState.action) {
			this.confirmationState.action();
		}
		this.hideConfirmation();
	}

	/** Start periodic node status polling. */
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

	/** Stop status polling interval. */
	stopStatusUpdateInterval() {
		if (this.statusUpdateInterval) {
			clearInterval(this.statusUpdateInterval);
			this.statusUpdateInterval = null;
		}
	}

	/** Refresh status for all nodes in background. */
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

	/** Force reload of user storage node list. */
	async refreshStorageNodes() {
		this.loading = true;
		this.clearMessages();
		try {
			// Fetch user storage nodes
			const response: any = await this.nodeService.loadUserStorageNodes();
			if (!response.success) {
				this.messageState = setErrorMessage(
					this.messageState,
					response.message || 'Failed to fetch storage nodes.'
				);
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}
			this.messageState = setErrorMessage(
				this.messageState,
				error.message || 'An unexpected error occurred'
			);
		} finally {
			this.loading = false;
		}
	}

	/** Register a new node. */
	async registerNode() {
		// Validate node name using utility function
		const validation = validateNodeName(this.registerNodeName);
		if (!validation.isValid) {
			this.registerMessage = validation.message || 'Please enter a valid Node Name';
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

	/** Update single node status. */
	async checkNodeStatus(nodeId: string) {
		this.loading = true;
		this.clearMessages();
		if (!nodeId.trim()) {
			this.messageState = setErrorMessage(
				this.messageState,
				'Invalid Node ID provided for status check.'
			);
			return;
		}

		// Retrieve the status of the node
		try {
			const response: any = await this.nodeService.updateNodeStatus(nodeId);

			if (!response.success) {
				this.messageState = setErrorMessage(
					this.messageState,
					response.error || 'Failed to retrieve node status.'
				);
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}
			this.messageState = setErrorMessage(
				this.messageState,
				error.message || 'An unexpected error occurred'
			);
		} finally {
			this.loading = false;
		}
	}

	/** Prompt and delete a node. */
	async deleteNode(nodeId: string) {
		if (!nodeId.trim()) {
			this.messageState = setErrorMessage(
				this.messageState,
				'Invalid Node ID provided for deletion.'
			);
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

	/** Perform confirmed node deletion. */
	async performDeleteNode(nodeId: string) {
		this.loading = true;
		this.clearMessages();

		try {
			const response: any = await this.nodeService.deleteStorageNode(nodeId);
			if (!response.success) {
				this.messageState = setErrorMessage(
					this.messageState,
					response.error || 'Failed to delete storage node.'
				);
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}
			this.messageState = setErrorMessage(
				this.messageState,
				error.message || 'An unexpected error occurred'
			);
		} finally {
			this.loading = false;
		}
	}

	/** Logout with confirmation. */
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

	/** Navigate to file browser for node. */
	openFileBrowser(node: StorageNode) {
		this.router.navigate(['/file-browser', node.node_id], {
			queryParams: { nodeName: node.node_name }
		});
	}

	/** Navigate to storage setup help. */
	openStorageSetupInstructions() {
		this.router.navigate(['/storage-setup-instructions']);
	}

	/** Clear current messages. */
	clearMessages() {
		this.messageState = clearMessageState(this.messageState);
	}

	// Getters used in template
	get error(): string {
		return this.messageState.error;
	}

	get warning(): string {
		return this.messageState.warning;
	}

	get showConfirmPopup(): boolean {
		return this.confirmationState.show;
	}

	get confirmTitle(): string {
		return this.confirmationState.title;
	}

	get confirmMessage(): string {
		return this.confirmationState.message;
	}
}
