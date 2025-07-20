// src/app/file-browser/file-browser.component.ts

import {
	Component,
	OnInit,
	OnDestroy,
	ViewChild,
	ElementRef,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Subscription } from "rxjs";
import {
	FileService,
	DirectoryItem,
	DeleteResult,
	UploadResult,
} from "../file.service";
import { AuthService } from "../auth.service";
import { SessionHandlerService } from "../session-handler.service";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { formatFileSize, formatDate } from "../utils/utils";

// Interface for breadcrumb path
@Component({
	selector: "app-file-browser",
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: "./file-browser.component.html",
})
export class FileBrowserComponent implements OnInit, OnDestroy {
	nodeId: string = "";
	nodeName: string = "";

	directoryList: DirectoryItem[] = [];
	directoryPath: string[] = [];

	loading: boolean = false;
	error: string = "";
	warning: string = "";

	initialized: boolean = false;

	isUploading: boolean = false;
	uploadStatus: string = "";
	uploadProgress: number = 0;
	uploadChunksInfo: string = "";

	isDownloading: boolean = false;
	downloadStatus: string = "";
	downloadProgress: number = 0;
	downloadChunksInfo: string = "";

	isCreatingDirectory: boolean = false;
	newDirectoryName: string = "";

	@ViewChild("fileInput") fileInput!: ElementRef<HTMLInputElement>;
	@ViewChild("directoryInput") directoryInput!: ElementRef<HTMLInputElement>;

	private routeSub: Subscription | undefined;
	private directorySub: Subscription | undefined;
	private uploadProgressSub: Subscription | undefined;
	private downloadProgressSub: Subscription | undefined;

	public formatFileSize = formatFileSize;
	public formatDate = formatDate;

	constructor(
		private route: ActivatedRoute,
		private router: Router,
		public fileService: FileService,
		private authService: AuthService,
		private sessionHandler: SessionHandlerService
	) {}

	ngOnInit(): void {
		this.routeSub = this.route.params.subscribe((params) => {
			this.nodeId = params["nodeId"];
			this.nodeName = params["nodeName"];
			if (this.nodeId) {
				this.initializeFileSystem();
			}
		});

		// Subscribe to directory changes
		this.directorySub = this.fileService["directory"].subscribe((dir) => {
			if (dir) {
				this.fileService.getDirectoryContents().then((contents) => {
					this.directoryList = contents;
				});
			} else {
				this.directoryList = [];
			}
		});

		// Subscribe to upload progress
		this.uploadProgressSub = this.fileService
			.getUploadProgress()
			.subscribe((progress) => {
				this.isUploading = progress.isUploading;

				if (progress.isUploading) {
					this.uploadStatus = `Uploading ${progress.fileName}`;
					this.uploadProgress = progress.progress;
					this.uploadChunksInfo = `Chunks: ${progress.chunksUploaded}/${progress.totalChunks}`;
				} else if (progress.progress === 100 && progress.fileName) {
					this.uploadStatus = `Successfully uploaded ${progress.fileName}`;
					this.uploadChunksInfo = "";
					// Clear status after a few seconds
					setTimeout(() => {
						this.uploadStatus = "";
						this.uploadProgress = 0;
						this.uploadChunksInfo = "";
					}, 3000);
				}
			});

		// Subscribe to download progress
		this.downloadProgressSub = this.fileService
			.getDownloadProgress()
			.subscribe((progress) => {
				this.isDownloading = progress.isDownloading;

				if (progress.isDownloading) {
					this.downloadStatus = `Downloading ${progress.fileName}`;
					this.downloadProgress = progress.progress;
					this.downloadChunksInfo = `Chunks: ${progress.chunksDownloaded}/${progress.totalChunks}`;
				} else if (progress.progress === 100 && progress.fileName) {
					this.downloadStatus = `Successfully downloaded ${progress.fileName}`;
					this.downloadChunksInfo = "";
					// Clear status after a few seconds
					setTimeout(() => {
						this.downloadStatus = "";
						this.downloadProgress = 0;
						this.downloadChunksInfo = "";
					}, 3000);
				}
			});
	}

	ngOnDestroy(): void {
		if (this.routeSub) {
			this.routeSub.unsubscribe();
		}
		if (this.directorySub) {
			this.directorySub.unsubscribe();
		}
		if (this.uploadProgressSub) {
			this.uploadProgressSub.unsubscribe();
		}
		if (this.downloadProgressSub) {
			this.downloadProgressSub.unsubscribe();
		}
	}

	triggerFileUpload(): void {
		this.fileInput.nativeElement.click();
	}

	triggerDirectoryUpload(): void {
		this.directoryInput.nativeElement.click();
	}

	startCreatingDirectory(): void {
		this.isCreatingDirectory = true;
		this.newDirectoryName = "";
		this.error = "";
	}

	cancelCreateDirectory(): void {
		this.isCreatingDirectory = false;
		this.newDirectoryName = "";
	}

	clearMessages(): void {
		this.error = "";
		this.warning = "";
	}

	goBack() {
		this.router.navigate(["/dashboard"]);
	}

	getPath(): string {
		return this.directoryPath.join("/") || "/";
	}

	async initializeFileSystem() {
		this.loading = true;
		this.clearMessages();
		this.initialized = false;

		try {
			const password = await this.authService.getUserPassword();
			if (!password) {
				// Session expired - redirect to login immediately
				this.sessionHandler.handleSessionExpired();
				return;
			}

			// Initialize the file service
			const result = await this.fileService.initializePage(
				password,
				this.nodeId
			);

			if (result.success) {
				// Set the initial path
				this.directoryPath = [""];

				this.initialized = true;
			} else {
				// Some error occured
				this.error = result.message || "Unknown error";
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}

			throw error;
		} finally {
			this.loading = false;
		}
	}

	private updateDirectoryListing(): void {
		this.clearMessages();

		this.fileService.getDirectoryContents().then((contents) => {
			this.directoryList = contents;
		});
	}

	async onFilesSelected(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const files = input.files;

		if (!files || files.length === 0) {
			return;
		}

		this.clearMessages();

		try {
			let result;

			if (files.length === 1) {
				// Single file upload with confirmation
				result = await this.handleSingleFileUpload(files[0]);
			} else {
				// Multiple files upload with confirmation
				result = await this.handleMultipleFilesUpload(files);
			}

			if (result.success) {
				this.updateDirectoryListing();
			} else {
				this.error = `Upload failed: ${result.message}`;
			}
		} catch (error: any) {
			this.error = `Upload failed: ${
				error.message || "A critical error occurred."
			}`;
		} finally {
			// Reset the input so the user can select the same files again
			input.value = "";
		}
	}

	private async handleSingleFileUpload(file: File): Promise<UploadResult> {
		// First, try to upload without overwrite
		let result = await this.fileService.uploadFile(file, file.name, false);

		// If it requires confirmation (file exists), ask user
		if (!result.success && result.requiresConfirmation) {
			if (
				confirm(
					`File "${file.name}" already exists. Do you want to overwrite it?`
				)
			) {
				// User confirmed overwrite
				result = await this.fileService.uploadFile(file, file.name, true);
			} else {
				// User cancelled - return success but with a message
				return {
					success: true,
					message: `Upload cancelled: File "${file.name}" already exists`
				};
			}
		}

		return result;
	}

	private async handleMultipleFilesUpload(files: FileList): Promise<UploadResult> {
		// Check for conflicts first
		const conflicts: string[] = [];
		const currentDir = this.fileService.getCurrentDirectory();
		
		if (currentDir) {
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const existingFile = currentDir.contents.find(
					item => item.type === 'file' && item.name === file.name
				);
				if (existingFile) {
					conflicts.push(file.name);
				}
			}
		}

		let overwriteAll = false;

		// If there are conflicts, ask user what to do
		if (conflicts.length > 0) {
			const conflictMessage = conflicts.length === 1 
				? `File "${conflicts[0]}" already exists.`
				: `${conflicts.length} files already exist: ${conflicts.slice(0, 3).join(', ')}${conflicts.length > 3 ? '...' : ''}.`;
			
			const choice = confirm(
				`${conflictMessage}\n\nClick OK to overwrite existing files, or Cancel to skip them.`
			);

			if (choice) {
				overwriteAll = true;
			}
			// If user cancelled, overwriteAll remains false and existing files will be skipped
		}

		// Upload with the user's choice
		return await this.fileService.uploadMultipleFiles(files, overwriteAll);
	}

	async onDirectorySelected(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const files = input.files;

		if (!files || files.length === 0) {
			return;
		}

		this.clearMessages();

		try {
			const result = await this.fileService.uploadDirectory(files);

			if (result.success) {
				this.updateDirectoryListing();
			} else {
				this.error = `Upload failed: ${result.message}`;
			}
		} catch (error: any) {
			this.error = `Upload failed: ${
				error.message || "A critical error occurred."
			}`;
		} finally {
			// Reset the input so the user can select the same directory again
			input.value = "";
		}
	}

	async onFileDownload(item: DirectoryItem): Promise<void> {
		// Only allow downloading files, not directories
		if (item.type !== "file") {
			this.error = "Cannot download directories";
			return;
		}

		this.clearMessages();

		try {
			const decryptedBlob = await this.fileService.downloadFile(item);
			if (!(decryptedBlob instanceof Blob)) {
				throw new Error("Download failed: Not a valid file blob.");
			}
			// Create a temporary URL for the Blob and trigger a download
			const url = window.URL.createObjectURL(decryptedBlob);
			const a = document.createElement("a");
			document.body.appendChild(a);
			a.style.display = "none";
			a.href = url;
			a.download = item.name;
			a.click();
			window.URL.revokeObjectURL(url);
			a.remove();
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}

			this.error = `Download failed: ${
				error.message || "A critical error occurred."
			}`;
		}
	}

	async deleteItem(item: DirectoryItem): Promise<void> {
		// Validate the item
		if (item.type === "file" && !item.fileChunks[0]) {
			this.error = "Cannot delete: Invalid item (missing file chunk(s))";
			return;
		} else if (item.type === "directory" && !item.chunkId) {
			this.error = "Cannot delete: Invalid item (missing directory ID)";
			return;
		}

		// Confirm deletion
		if (
			!confirm(
				`Are you sure you want to delete "${item.name}"? This action cannot be undone.`
			)
		) {
			return;
		}

		// Show loading state
		this.loading = true;
		this.clearMessages();

		try {
			// First, try to delete without recursive option
			let result = await this.fileService.deleteItem(item, false);

			// If it's a non-empty directory, ask for confirmation
			if (!result.success && result.requiresConfirmation) {
				if (
					confirm(
						`"${item.name}" is not empty. Do you want to delete it and all its contents recursively? This action cannot be undone.`
					)
				) {
					// User confirmed recursive deletion
					result = await this.fileService.deleteItem(item, true);
				} else {
					// User cancelled
					this.loading = false;
					return;
				}
			} else if (!result.success) {
				this.error = result.message || "Failed to delete item";
				return;
			}

			// Refresh the current directory listing after successful deletion
			this.updateDirectoryListing();
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}

			// Show error message for unexpected errors
			this.error =
				error.message || "An unexpected error occurred while deleting";
		} finally {
			this.loading = false;
		}
	}

	async enterDirectory(item: DirectoryItem): Promise<void> {
		if (item.type !== "directory") {
			return;
		}

		try {
			this.loading = true;
			this.clearMessages();

			const result = await this.fileService.changeDirectory(item.chunkId);

			if (result.success) {
				// Update breadcrumb path
				this.directoryPath.push(item.name);

				// Force refresh the directory listing
				this.updateDirectoryListing();
			} else {
				this.error = result.message || "Unknown error";
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}

			throw error;
		} finally {
			this.loading = false;
		}
	}

	async leaveDirectory(): Promise<void> {
		// Can't leave if we're at the root directory or path is empty
		if (this.directoryPath.length <= 1) {
			return;
		}

		try {
			this.loading = true;
			this.clearMessages();

			// Go to parent
			const result = await this.fileService.leaveDirectory();

			if (result.success) {
				// Update breadcrumb path by removing the last segment
				this.directoryPath.pop();

				// Force refresh the directory listing
				this.updateDirectoryListing();
			} else {
				this.error = result.message || "Unknown error";
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}

			throw error;
		} finally {
			this.loading = false;
		}
	}

	async createNewDirectory(): Promise<void> {
		if (!this.newDirectoryName.trim()) {
			this.warning = "Directory name cannot be empty";
			return;
		}

		// Validate directory name
		const invalidChars = /[<>:"/\\|?*]/;
		if (invalidChars.test(this.newDirectoryName)) {
			this.warning = "Directory name contains invalid characters";
			return;
		}

		this.loading = true;
		this.clearMessages();

		try {
			const result = await this.fileService.createSubdirectory(
				this.newDirectoryName.trim()
			);

			if (result.success) {
				this.isCreatingDirectory = false;
				this.newDirectoryName = "";
			} else {
				this.error = result.message || "Unknown error";
			}
		} catch (error: any) {
			// Check if this is a session/authentication error
			if (this.sessionHandler.checkAndHandleSessionError(error)) {
				return;
			}

			throw error;
		} finally {
			this.loading = false;
		}
	}
}
