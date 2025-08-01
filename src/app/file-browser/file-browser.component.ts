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
import { FileService, DirectoryItem, UploadResult } from "../file.service";
import { AuthService } from "../auth.service";
import { SessionHandlerService } from "../session-handler.service";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { formatFileSize, formatDate } from "../utils/utils";

// Interface for progress tracking
interface ProgressData {
	fileName: string;
	progress: number;
	isUploading?: boolean;
	isDownloading?: boolean;
	chunksUploaded?: number;
	chunksDownloaded?: number;
	totalChunks: number;
}
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

	// File selection properties
	isSelectionMode: boolean = false;
	selectedItems: Set<DirectoryItem> = new Set();

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

		this.setupSubscriptions();
	}

	private setupSubscriptions(): void {
		// Subscribe to directory changes
		this.directorySub = this.fileService["directory"].subscribe((dir) => {
			this.directoryList = dir ? [] : [];
			if (dir) {
				this.fileService.getDirectoryContents().then((contents) => {
					this.directoryList = contents;
				});
			}
		});

		// Subscribe to upload progress
		this.uploadProgressSub = this.fileService
			.getUploadProgress()
			.subscribe((progress) => {
				this.handleProgressUpdate(progress, "upload");
			});

		// Subscribe to download progress
		this.downloadProgressSub = this.fileService
			.getDownloadProgress()
			.subscribe((progress) => {
				this.handleProgressUpdate(progress, "download");
			});
	}

	private handleProgressUpdate(
		progress: ProgressData,
		type: "upload" | "download"
	): void {
		const isActive = type === "upload" ? "isUploading" : "isDownloading";
		const status = type === "upload" ? "uploadStatus" : "downloadStatus";
		const progressProp =
			type === "upload" ? "uploadProgress" : "downloadProgress";
		const chunksInfo =
			type === "upload" ? "uploadChunksInfo" : "downloadChunksInfo";
		const chunksKey =
			type === "upload" ? "chunksUploaded" : "chunksDownloaded";

		this[isActive] = Boolean(
			progress.isUploading || progress.isDownloading
		);

		if (progress.isUploading || progress.isDownloading) {
			const action = type === "upload" ? "Uploading" : "Downloading";
			this[status] = `${action} ${progress.fileName}`;
			this[progressProp] = progress.progress;
			this[chunksInfo] = `Chunks: ${progress[chunksKey] || 0}/${
				progress.totalChunks
			}`;
		} else if (progress.progress === 100 && progress.fileName) {
			const action = type === "upload" ? "uploaded" : "downloaded";
			this[status] = `Successfully ${action} ${progress.fileName}`;
			this[chunksInfo] = "";

			// Clear status after a few seconds
			setTimeout(() => {
				this[status] = "";
				this[progressProp] = 0;
				this[chunksInfo] = "";
			}, 3000);
		}
	}

	ngOnDestroy(): void {
		this.cleanupSubscriptions();
	}

	private cleanupSubscriptions(): void {
		const subscriptions = [
			this.routeSub,
			this.directorySub,
			this.uploadProgressSub,
			this.downloadProgressSub,
		];

		subscriptions.forEach((sub) => {
			if (sub) {
				sub.unsubscribe();
			}
		});
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

	toggleSelectionMode(): void {
		this.isSelectionMode = !this.isSelectionMode;
		if (!this.isSelectionMode) {
			this.selectedItems.clear();
		}
	}

	toggleItemSelection(item: DirectoryItem): void {
		if (this.selectedItems.has(item)) {
			this.selectedItems.delete(item);
		} else {
			this.selectedItems.add(item);
		}
	}

	isItemSelected(item: DirectoryItem): boolean {
		return this.selectedItems.has(item);
	}

	selectAllItems(): void {
		this.directoryList.forEach((item) => this.selectedItems.add(item));
	}

	deselectAllItems(): void {
		this.selectedItems.clear();
	}

	getSelectedCount(): number {
		return this.selectedItems.size;
	}

	private handleError(error: any, defaultMessage: string): boolean {
		// Check if this is a session/authentication error
		if (this.sessionHandler.checkAndHandleSessionError(error)) {
			return true; // Session error handled, should return from calling method
		}

		this.error = error.message || defaultMessage;
		return false; // Continue with normal error handling
	}

	private async executeWithErrorHandling<T>(
		operation: () => Promise<T>,
		errorMessage: string
	): Promise<T | null> {
		this.loading = true;
		this.clearMessages();

		try {
			const result = await operation();
			return result;
		} catch (error: any) {
			if (this.handleError(error, errorMessage)) {
				return null;
			}
			throw error;
		} finally {
			this.loading = false;
		}
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
				this.sessionHandler.handleSessionExpired();
				return;
			}

			const result = await this.fileService.initializePage(
				password,
				this.nodeId
			);

			if (result.success) {
				this.directoryPath = [""];
				this.initialized = true;
			} else {
				this.error =
					result.message || "Failed to initialize file system";
			}
		} catch (error: any) {
			if (this.handleError(error, "Failed to initialize file system")) {
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
			const uploadResult =
				files.length === 1
					? await this.handleSingleFileUpload(files[0])
					: await this.handleMultipleFilesUpload(files);

			if (uploadResult?.success) {
				this.updateDirectoryListing();
			} else if (uploadResult?.message) {
				this.error = `Upload failed: ${uploadResult.message}`;
			}
		} catch (error: any) {
			if (this.handleError(error, "Upload failed")) {
				return;
			}
		}

		// Reset input regardless of result
		input.value = "";
	}

	async onDirectorySelected(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const files = input.files;

		if (!files || files.length === 0) {
			return;
		}

		this.clearMessages();

		try {
			const uploadResult = await this.fileService.uploadDirectory(files);

			if (uploadResult.success) {
				this.updateDirectoryListing();
			} else {
				this.error = `Upload failed: ${uploadResult.message}`;
			}
		} catch (error: any) {
			if (this.handleError(error, "Directory upload failed")) {
				return;
			}
		}

		// Reset input regardless of result
		input.value = "";
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
				result = await this.fileService.uploadFile(
					file,
					file.name,
					true
				);
			} else {
				// User cancelled - return success but with a message
				return {
					success: true,
					message: `Upload cancelled: File "${file.name}" already exists`,
				};
			}
		}

		return result;
	}

	private async handleMultipleFilesUpload(
		files: FileList
	): Promise<UploadResult> {
		// Check for conflicts first
		const conflicts: string[] = [];
		const currentDir = this.fileService.getCurrentDirectory();

		if (currentDir) {
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const existingFile = currentDir.contents.find(
					(item) => item.type === "file" && item.name === file.name
				);
				if (existingFile) {
					conflicts.push(file.name);
				}
			}
		}

		let overwriteAll = false;

		// If there are conflicts, ask user what to do
		if (conflicts.length > 0) {
			const conflictMessage =
				conflicts.length === 1
					? `File "${conflicts[0]}" already exists.`
					: `${conflicts.length} files already exist: ${conflicts
							.slice(0, 3)
							.join(", ")}${conflicts.length > 3 ? "..." : ""}.`;

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

	private async getDownloadData(
		item: DirectoryItem
	): Promise<{ blob: Blob; fileName: string }> {
		let blob: Blob;
		let fileName: string;

		if (item.type === "file") {
			blob = await this.fileService.downloadFile(item);
			fileName = item.name;
		} else if (item.type === "directory") {
			blob = await this.fileService.downloadDirectory(item);
			fileName = `${item.name}.zip`;
		} else {
			throw new Error("Unknown item type");
		}

		if (!(blob instanceof Blob)) {
			throw new Error("Download failed: Not a valid file blob.");
		}

		return { blob, fileName };
	}

	private triggerDownload(blob: Blob, fileName: string): void {
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		document.body.appendChild(a);
		a.style.display = "none";
		a.href = url;
		a.download = fileName;
		a.click();
		window.URL.revokeObjectURL(url);
		a.remove();
	}

	async enterDirectory(item: DirectoryItem): Promise<void> {
		if (item.type !== "directory") {
			return;
		}

		// Clear selection when navigating
		this.selectedItems.clear();

		await this.navigateDirectory(
			() => this.fileService.changeDirectory(item.chunkId),
			() => this.directoryPath.push(item.name),
			"Failed to enter directory"
		);
	}

	async leaveDirectory(): Promise<void> {
		if (this.directoryPath.length <= 1) {
			return;
		}

		// Clear selection when navigating
		this.selectedItems.clear();

		await this.navigateDirectory(
			() => this.fileService.leaveDirectory(),
			() => this.directoryPath.pop(),
			"Failed to leave directory"
		);
	}

	private async navigateDirectory(
		serviceCall: () => Promise<{ success: boolean; message?: string }>,
		pathUpdate: () => void,
		errorMessage: string
	): Promise<void> {
		this.loading = true;
		this.clearMessages();

		try {
			const result = await serviceCall();

			if (result.success) {
				pathUpdate();
				this.updateDirectoryListing();
			} else {
				this.error = result.message || errorMessage;
			}
		} catch (error: any) {
			if (this.handleError(error, errorMessage)) {
				return;
			}
			throw error;
		} finally {
			this.loading = false;
		}
	}

	async createNewDirectory(): Promise<void> {
		if (!this.validateDirectoryName()) {
			return;
		}

		const result = await this.executeWithErrorHandling(async () => {
			const createResult = await this.fileService.createSubdirectory(
				this.newDirectoryName.trim()
			);

			if (createResult.success) {
				this.resetDirectoryCreation();
				this.updateDirectoryListing();
			} else {
				this.error =
					createResult.message || "Failed to create directory";
			}
		}, "Failed to create directory");
	}

	private validateDirectoryName(): boolean {
		if (!this.newDirectoryName.trim()) {
			this.warning = "Directory name cannot be empty";
			return false;
		}

		const invalidChars = /[<>:"/\\|?*]/;
		if (invalidChars.test(this.newDirectoryName)) {
			this.warning = "Directory name contains invalid characters";
			return false;
		}

		return true;
	}

	private resetDirectoryCreation(): void {
		this.isCreatingDirectory = false;
		this.newDirectoryName = "";
	}

	// Batch operations
	async downloadSelectedItems(): Promise<void> {
		if (this.selectedItems.size === 0) {
			this.warning = "No items selected for download";
			return;
		}

		this.clearMessages();

		try {
			if (this.selectedItems.size === 1) {
				// Single item - use existing download logic
				const item = Array.from(this.selectedItems)[0];
				const { blob, fileName } = await this.getDownloadData(item);
				this.triggerDownload(blob, fileName);
			} else {
				// Multiple items - create a ZIP
				await this.downloadMultipleItemsAsZip();
			}
		} catch (error: any) {
			if (this.handleError(error, "Download failed")) {
				return;
			}
		}
	}

	private async downloadMultipleItemsAsZip(): Promise<void> {
		// Import JSZip dynamically if not already imported
		const JSZip = (await import("jszip")).default;
		const zip = new JSZip();

		// Update progress
		this.updateDownloadProgress({
			fileName: "selected-items.zip",
			progress: 0,
			isDownloading: true,
			chunksDownloaded: 0,
			totalChunks: this.selectedItems.size,
		});

		let processedCount = 0;
		const totalItems = this.selectedItems.size;

		for (const item of this.selectedItems) {
			try {
				if (item.type === "file") {
					const fileBlob = await this.fileService.downloadFile(item);
					zip.file(item.name, fileBlob);
				} else if (item.type === "directory") {
					// For directories, we need to create a ZIP structure
					const dirBlob = await this.fileService.downloadDirectory(
						item
					);
					zip.file(`${item.name}.zip`, dirBlob);
				}

				processedCount++;
				const progress = Math.round(
					(processedCount / totalItems) * 100
				);
				this.updateDownloadProgress({
					fileName: "selected-items.zip",
					progress,
					isDownloading: true,
					chunksDownloaded: processedCount,
					totalChunks: totalItems,
				});
			} catch (error) {
				console.warn(`Failed to add ${item.name} to ZIP:`, error);
			}
		}

		// Generate and download the ZIP
		const zipBlob = await zip.generateAsync({ type: "blob" });
		this.triggerDownload(zipBlob, "selected-items.zip");

		// Complete progress
		this.updateDownloadProgress({
			fileName: "selected-items.zip",
			progress: 100,
			isDownloading: false,
			chunksDownloaded: totalItems,
			totalChunks: totalItems,
		});
	}

	private updateDownloadProgress(progress: any): void {
		// TODO: This method should be properly typed, but for now using any to match existing pattern
		this.downloadStatus = `Downloading ${progress.fileName}`;
		this.downloadProgress = progress.progress;
		this.isDownloading = progress.isDownloading;
		this.downloadChunksInfo = `Items: ${progress.chunksDownloaded}/${progress.totalChunks}`;
	}

	async deleteSelectedItems(): Promise<void> {
		if (this.selectedItems.size === 0) {
			this.warning = "No items selected for deletion";
			return;
		}

		const itemCount = this.selectedItems.size;
		const itemNames = Array.from(this.selectedItems)
			.map((item) => item.name)
			.slice(0, 3);
		const displayNames =
			itemNames.join(", ") + (itemCount > 3 ? "..." : "");

		// Check for non-empty directories first
		const nonEmptyDirs = Array.from(this.selectedItems)
			.filter((item) => item.type === "directory")
			.map((item) => item.name);

		let confirmMessage = `Are you sure you want to delete ${itemCount} selected item${
			itemCount > 1 ? "s" : ""
		}: ${displayNames}?`;

		if (nonEmptyDirs.length > 0) {
			confirmMessage += `\n\nThis includes ${
				nonEmptyDirs.length
			} director${
				nonEmptyDirs.length > 1 ? "ies" : "y"
			} that may contain files. All contents will be deleted recursively.`;
		}

		confirmMessage += "\n\nThis action cannot be undone.";

		if (!confirm(confirmMessage)) {
			return;
		}

		this.loading = true;
		this.clearMessages();

		const errors: string[] = [];
		let deletedCount = 0;

		try {
			// Process all selected items, but find fresh references from current directory listing
			for (const selectedItem of Array.from(this.selectedItems)) {
				try {
					// Find the current item in the directory listing by name and type
					const currentItem = this.directoryList.find(
						(dirItem) =>
							dirItem.name === selectedItem.name &&
							dirItem.type === selectedItem.type
					);

					if (!currentItem) {
						continue;
					}

					if (this.validateItemForDeletion(currentItem)) {
						await this.performBatchDeletion(currentItem);
						deletedCount++;

						this.directoryList = this.directoryList.filter(
							(item) =>
								!(
									item.name === currentItem.name &&
									item.type === currentItem.type
								)
						);
					}
				} catch (error: any) {
					errors.push(
						`${selectedItem.name}: ${
							error.message || "Unknown error"
						}`
					);
				}
			}

			// Clear selection and update listing only once at the end
			this.selectedItems.clear();
			this.updateDirectoryListing();

			// Only show errors if there were actual failure errors, not "no longer exists" cases
			const realErrors = errors.filter(
				(error) => !error.includes("no longer exists")
			);
			if (realErrors.length > 0) {
				this.warning = `${deletedCount} items deleted successfully. Errors: ${realErrors.join(
					"; "
				)}`;
			} else if (deletedCount > 0) {
				// All items processed successfully
				this.warning = `${deletedCount} items deleted successfully.`;
			}
		} catch (error: any) {
			if (
				this.handleError(
					error,
					"An unexpected error occurred during batch deletion"
				)
			) {
				return;
			}
		} finally {
			this.loading = false;
		}
	}

	private async performBatchDeletion(item: DirectoryItem): Promise<void> {
		// For batch operations, always try recursive deletion without individual prompts
		let result = await this.fileService.deleteItem(item, true);

		if (!result.success) {
			throw new Error(result.message || "Failed to delete item");
		}
	}

	private validateItemForDeletion(item: DirectoryItem): boolean {
		if (item.type === "file" && !item.fileChunks[0]) {
			this.error = "Cannot delete: Invalid item (missing file chunk(s))";
			return false;
		}
		if (item.type === "directory" && !item.chunkId) {
			this.error = "Cannot delete: Invalid item (missing directory ID)";
			return false;
		}
		return true;
	}
}
