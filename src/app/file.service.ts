// File: src/app/file.service.ts - Encrypted virtual filesystem ops: dirs, chunked file upload/download, progress.

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { CryptoService } from './crypto.service';
import { firstValueFrom } from 'rxjs';
import JSZip from 'jszip';

// Progress tracking interfaces
export interface ProgressData {
	fileName: string;
	progress: number;
	isUploading: boolean;
	chunksUploaded: number;
	totalChunks: number;
}

export interface DownloadProgressData {
	fileName: string;
	progress: number;
	isDownloading: boolean;
	chunksDownloaded: number;
	totalChunks: number;
}

export interface Directory {
	name: string;
	chunkId: string;
	parentId: string;
	contents: DirectoryItem[];
}

export interface DeleteResult {
	success: boolean;
	message?: string;
	requiresConfirmation?: boolean;
}

export interface UploadResult {
	success: boolean;
	message?: string;
	requiresConfirmation?: boolean;
}

export type DirectoryItem =
	| {
			type: 'directory';
			name: string;
			chunkId: string;
	  }
	| {
			type: 'file';
			name: string;
			size: number;
			createdAt: string;
			fileChunks: string[];
	  };

@Injectable({
	providedIn: 'root'
})
/** File service: encrypted directory + file CRUD, chunk transfer & progress tracking. */
export class FileService {
	private apiUrl: string;

	// Directory state
	private directory = new BehaviorSubject<Directory | null>(null);
	private storageNodeId: string | null = null;

	// Upload progress tracking
	private uploadProgress = new BehaviorSubject<ProgressData>({
		fileName: '',
		progress: 0,
		isUploading: false,
		chunksUploaded: 0,
		totalChunks: 0
	});

	// Download progress tracking
	private downloadProgress = new BehaviorSubject<DownloadProgressData>({
		fileName: '',
		progress: 0,
		isDownloading: false,
		chunksDownloaded: 0,
		totalChunks: 0
	});

	private readonly CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB

	constructor(
		private http: HttpClient,
		private authService: AuthService,
		private cryptoService: CryptoService
	) {
		this.apiUrl = this.authService.getApiUrl();
	}

	/** Get current directory model (null if not initialized). */
	getCurrentDirectory(): Directory | null {
		return this.directory.getValue();
	}

	/** Observable upload progress stream. */
	getUploadProgress() {
		return this.uploadProgress.asObservable();
	}

	/** Snapshot of current upload progress. */
	getCurrentUploadProgress() {
		return this.uploadProgress.getValue();
	}

	/** Observable download progress stream. */
	getDownloadProgress() {
		return this.downloadProgress.asObservable();
	}

	/** Snapshot of current download progress. */
	getCurrentDownloadProgress() {
		return this.downloadProgress.getValue();
	}

	/** Ensure a storage node has been selected. */
	private validateStorageNode(): void {
		if (!this.storageNodeId) {
			throw new Error('Node ID not available');
		}
	}

	/** Ensure directory loaded and return it. */
	private validateCurrentDirectory(): Directory {
		const currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			throw new Error('Current directory is not initialized');
		}
		return currentDirectory;
	}

	/** Merge upload progress delta. */
	private updateUploadProgress(progress: Partial<ProgressData>): void {
		this.uploadProgress.next({
			...this.uploadProgress.getValue(),
			...progress
		});
	}

	/** Merge download progress delta. */
	private updateDownloadProgress(progress: Partial<DownloadProgressData>): void {
		this.downloadProgress.next({
			...this.downloadProgress.getValue(),
			...progress
		});
	}

	/** Reset upload progress state. */
	private resetUploadProgress(): void {
		this.updateUploadProgress({
			fileName: '',
			progress: 0,
			isUploading: false,
			chunksUploaded: 0,
			totalChunks: 0
		});
	}

	/** Reset download progress state. */
	private resetDownloadProgress(): void {
		this.updateDownloadProgress({
			fileName: '',
			progress: 0,
			isDownloading: false,
			chunksDownloaded: 0,
			totalChunks: 0
		});
	}

	/** Initialize root directory (derive chunk, fetch or create). */
	async initializePage(
		password: string,
		nodeId: string
	): Promise<{ success: boolean; message?: string }> {
		this.storageNodeId = nodeId;

		try {
			const rootChunkId = await this.cryptoService.getRootChunk(password);
			return await this.initializeRootDirectory(rootChunkId);
		} catch (error: any) {
			return {
				success: false,
				message: `Error during initialization: ${error.message || error}`
			};
		}
	}

	/** Setup root directory from chunk (create if missing). */
	private async initializeRootDirectory(
		rootChunkId: string
	): Promise<{ success: boolean; message?: string }> {
		try {
			const jsonString = await this.fetchAndDecryptChunk(rootChunkId);

			if (jsonString) {
				const directoryData = JSON.parse(jsonString) as Directory;
				const clonedDirectory = structuredClone(directoryData);
				this.directory.next(clonedDirectory);
			}
			return { success: true };
		} catch (error: any) {
			if (error?.status === 404 && error.message?.includes('not found')) {
				return await this.createNewRootDirectory(rootChunkId);
			}
			throw error;
		}
	}

	/** Create brand new empty root directory. */
	private async createNewRootDirectory(
		rootChunkId: string
	): Promise<{ success: boolean; message?: string }> {
		try {
			const newRoot = await this.createDirectory('', '', rootChunkId);
			this.directory.next(newRoot);
			return { success: true };
		} catch (creationError: any) {
			return {
				success: false,
				message: `Failed to create a new root chunk: ${
					creationError.message || creationError
				}`
			};
		}
	}

	/** Create a directory object (optionally with provided chunkId). */
	private async createDirectory(
		name: string,
		parentId: string,
		chunkId?: string
	): Promise<Directory> {
		const newDirectory: Directory = {
			chunkId: chunkId || this.cryptoService.generateUUID(),
			name,
			parentId: parentId,
			contents: []
		};

		return await this.storeDirectory(newDirectory);
	}

	/** Persist updated directory JSON (delete old -> store new -> clone). */
	private async updateDirectory(): Promise<void> {
		this.validateStorageNode();
		let currentDirectory = this.validateCurrentDirectory();

		// Delete old directory metadata
		await this.deleteChunk(currentDirectory.chunkId);

		// Store updated directory metadata
		currentDirectory = await this.storeDirectory(currentDirectory);

		// Update the local state with a deep clone to trigger observable and UI update
		const updatedDirectory: Directory = structuredClone(currentDirectory);
		this.directory.next(updatedDirectory);
	}

	/** Store directory JSON; regenerate chunkId on conflict. */
	private async storeDirectory(directory: Directory): Promise<Directory> {
		this.validateStorageNode();

		while (true) {
			try {
				await this.encryptAndStoreChunk(JSON.stringify(directory), directory.chunkId);
				return directory;
			} catch (error: any) {
				if (error?.status === 409) {
					// Chunk ID conflict, generate a new one and retry
					directory.chunkId = this.cryptoService.generateUUID();
					continue;
				}
				throw error;
			}
		}
	}

	/** Create a new subdirectory in the current directory. */
	public async createSubdirectory(name: string): Promise<{ success: boolean; message?: string }> {
		try {
			this.validateStorageNode();
			const currentDirectory = this.validateCurrentDirectory();

			// Check if directory name already exists
			if (this.checkIfItemExists(currentDirectory, name)) {
				return {
					success: false,
					message: `Directory "${name}" already exists`
				};
			}

			// Create the new directory
			const newDirectory = await this.createDirectory(name, currentDirectory.chunkId);

			// Add the new directory to the current directory
			this.addDirectoryToContents(currentDirectory, newDirectory);

			// Update the directory metadata
			await this.updateDirectory();

			return { success: true };
		} catch (error) {
			return {
				success: false,
				message: `Error Creating Subdirectory: ${error}`
			};
		}
	}

	/** Check if name exists within directory. */
	private checkIfItemExists(directory: Directory, name: string): boolean {
		return directory.contents.some(item => item.name === name);
	}

	/** Add new directory entry to contents. */
	private addDirectoryToContents(currentDirectory: Directory, newDirectory: Directory): void {
		currentDirectory.contents = [
			...currentDirectory.contents,
			{
				type: 'directory',
				name: newDirectory.name,
				chunkId: newDirectory.chunkId
			}
		];
	}

	/** Change current working directory to provided chunk id. */
	public async changeDirectory(
		directoryChunkId: string
	): Promise<{ success: boolean; message?: string }> {
		try {
			this.validateStorageNode();

			// Fetch and decrypt the directory
			const directory = JSON.parse(
				await this.fetchAndDecryptChunk(directoryChunkId)
			) as Directory;

			// Update the current directory
			this.directory.next(directory);

			return { success: true };
		} catch (error) {
			return {
				success: false,
				message: `Error changing directory ${error}`
			};
		}
	}

	/** Leave current directory (go to parent). */
	public async leaveDirectory(): Promise<{
		success: boolean;
		message?: string;
	}> {
		const currentDirectory = this.validateCurrentDirectory();
		return this.changeDirectory(currentDirectory.parentId);
	}

	/** Get sorted contents (dirs then files). */
	public async getDirectoryContents(): Promise<DirectoryItem[]> {
		const currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			return [];
		}

		// Filter and sort directories and files, then concatenate
		const directories = currentDirectory.contents
			.filter(item => item.type === 'directory')
			.sort((a, b) => a.name.localeCompare(b.name));
		const files = currentDirectory.contents
			.filter(item => item.type === 'file')
			.sort((a, b) => a.name.localeCompare(b.name));

		return [...directories, ...files];
	}

	/** HTTP auth headers shortcut. */
	private get authHeaders(): HttpHeaders {
		return this.authService.getAuthHeaders();
	}

	/** Fetch encrypted chunk and return decrypted JSON string. */
	private async fetchAndDecryptChunk(chunkId: string): Promise<string> {
		this.validateStorageNode();
		try {
			const response: any = await firstValueFrom(
				this.http.get(`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}`, {
					headers: this.authHeaders,
					responseType: 'arraybuffer' as 'arraybuffer'
				})
			);
			return await this.processChunkResponse(response);
		} catch (error) {
			throw this.processChunkError(error);
		}
	}

	/** Process raw chunk HTTP response (extract IV + decrypt). */
	private async processChunkResponse(response: any): Promise<string> {
		if (!response || response.byteLength === 0) {
			throw new Error('No data received when fetching chunk');
		}

		const responseBuffer = new Uint8Array(response);

		if (responseBuffer.length < 12) {
			throw new Error('Invalid chunk data: too short');
		}

		// Extract IV and encrypted content
		const iv = responseBuffer.slice(0, 12);
		const encryptedContent = responseBuffer.slice(12);

		// Convert encrypted content to ArrayBuffer for decryption
		const encryptedArrayBuffer = encryptedContent.buffer.slice(
			encryptedContent.byteOffset,
			encryptedContent.byteOffset + encryptedContent.byteLength
		);

		return await this.decryptChunkData(encryptedArrayBuffer, iv);
	}

	/** Decrypt chunk payload. */
	private async decryptChunkData(encryptedData: ArrayBuffer, iv: Uint8Array): Promise<string> {
		const decryptedData = await this.cryptoService.decryptData(encryptedData, iv);
		return new TextDecoder().decode(decryptedData);
	}

	/** Build readable error from chunk fetch failure. */
	private processChunkError(error: any): Error {
		const errAny = error as any;
		if (errAny && errAny.error instanceof ArrayBuffer) {
			const errorString = this.decodeErrorBuffer(errAny.error);
			const jsonError = this.tryParseJsonError(errorString);
			if (jsonError?.message) {
				const err: any = new Error(jsonError.message);
				if (errAny.status) err.status = errAny.status;
				return err;
			} else {
				const err: any = new Error(errorString || 'Unknown error');
				if (errAny.status) err.status = errAny.status;
				return err;
			}
		}
		return error;
	}

	/** Decode ArrayBuffer -> string safely. */
	private decodeErrorBuffer(errorBuffer: ArrayBuffer): string {
		try {
			return new TextDecoder().decode(errorBuffer);
		} catch (e) {
			return '';
		}
	}

	/** Try parse JSON error payload. */
	private tryParseJsonError(errorString: string): any {
		try {
			return JSON.parse(errorString);
		} catch (e) {
			return null;
		}
	}

	/** Encrypt and store directory/file chunk (prepend IV). */
	private async encryptAndStoreChunk(data: string, chunkId: string): Promise<void> {
		this.validateStorageNode();

		// Encrypt the chunk data
		const dataBuffer = new TextEncoder().encode(data);
		const { encryptedData, iv: encryptionIv } =
			await this.cryptoService.encryptData(dataBuffer);

		// Prepare final data with IV prepended
		const finalData = this.prepareFinalChunkData(encryptedData, encryptionIv);

		await firstValueFrom(
			this.http.post(
				`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}`,
				new Blob([finalData]),
				{ headers: this.authHeaders.set('Content-Type', 'application/octet-stream') }
			)
		);
	}

	/** Concatenate IV + encrypted bytes. */
	private prepareFinalChunkData(encryptedData: ArrayBuffer, iv: Uint8Array): ArrayBuffer {
		const finalData = new ArrayBuffer(iv.length + encryptedData.byteLength);
		const finalView = new Uint8Array(finalData);
		finalView.set(iv);
		finalView.set(new Uint8Array(encryptedData), iv.length);
		return finalData;
	}

	/** Delete a chunk by id. */
	private async deleteChunk(chunkId: string): Promise<void> {
		this.validateStorageNode();

		await firstValueFrom(
			this.http.delete(`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}`, {
				headers: this.authHeaders
			})
		);
	}

	/** Delete file or directory (optional recursive). */
	public async deleteItem(
		item: DirectoryItem,
		recursive: boolean = false
	): Promise<{
		success: boolean;
		message?: string;
		requiresConfirmation?: boolean;
	}> {
		if (!this.storageNodeId) {
			return {
				success: false,
				message: 'Node ID not available'
			};
		}

		const currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			return {
				success: false,
				message: 'Current directory is not initialized'
			};
		}

		// Check if item exists in the current directory
		const existingItem = currentDirectory.contents.find(i => i === item);
		if (!existingItem) {
			return {
				success: false,
				message: 'Item not found in current directory'
			};
		}

		if (item.type === 'file') {
			try {
				// Delete all data chunks that make up this file
				for (const dataChunkId of item.fileChunks) {
					await this.deleteChunk(dataChunkId);
				}

				// Remove the file from the directory
				currentDirectory.contents = currentDirectory.contents.filter(
					dirItem => !(dirItem.type === 'file' && dirItem === item)
				);

				// Update the directory metadata
				await this.updateDirectory();

				return { success: true };
			} catch (error) {
				return {
					success: false,
					message: `Error deleting file: ${error}`
				};
			}
		} else if (item.type === 'directory') {
			try {
				// First, fetch the directory to check if it's empty
				const targetDirectory = JSON.parse(
					await this.fetchAndDecryptChunk(item.chunkId)
				) as Directory;

				// Check if directory is empty
				if (targetDirectory.contents.length > 0) {
					if (!recursive) {
						return {
							success: false,
							message: `Cannot delete "${item.name}": Directory is not empty. Please delete all files and subdirectories first.`,
							requiresConfirmation: true
						};
					}

					// Recursively delete all contents
					await this.deleteDirectoryRecursively(targetDirectory);
				}

				// Delete the directory chunk from storage
				await this.deleteChunk(item.chunkId);

				// Remove the directory from the parent directory
				currentDirectory.contents = currentDirectory.contents.filter(
					dirItem => !(dirItem.type === 'directory' && dirItem.chunkId === item.chunkId)
				);

				// Update the parent directory metadata
				await this.updateDirectory();

				return { success: true };
			} catch (error) {
				return {
					success: false,
					message: `Error deleting directory: ${error}`
				};
			}
		} else {
			return {
				success: false,
				message: 'Unknown item type. Cannot delete.'
			};
		}
	}

	/** Recursively delete directory tree (stack based). */
	private async deleteDirectoryRecursively(directory: Directory): Promise<void> {
		const stack: Directory[] = [directory];

		while (stack.length > 0) {
			const currentDirectory = stack.pop();
			if (!currentDirectory) continue;

			for (const item of currentDirectory.contents) {
				if (item.type === 'file') {
					// Delete all data chunks that make up this file
					for (const dataChunkId of item.fileChunks) {
						await this.deleteChunk(dataChunkId);
					}
				} else if (item.type === 'directory') {
					// Fetch the subdirectory and push it onto the stack
					const subDirectory = JSON.parse(
						await this.fetchAndDecryptChunk(item.chunkId)
					) as Directory;
					stack.push(subDirectory);

					// Delete the subdirectory chunk after processing its contents
					await this.deleteChunk(item.chunkId);
				}
			}
		}
	}

	/** Upload single file (optionally overwriting existing). */
	public async uploadFile(
		file: globalThis.File,
		fileName: string,
		overwrite: boolean = false
	): Promise<UploadResult> {
		try {
			this.validateStorageNode();
			if (!file) {
				return {
					success: false,
					message: 'No file provided for upload.'
				};
			}

			const currentDirectory = this.validateCurrentDirectory();

			// Handle existing file check and overwrite logic
			const overwriteResult = await this.handleFileOverwrite(
				currentDirectory,
				fileName,
				overwrite
			);
			if (!overwriteResult.success) {
				return overwriteResult;
			}

			// Perform the actual upload
			return await this.performFileUpload(file, fileName);
		} catch (error: any) {
			this.resetUploadProgress();
			return {
				success: false,
				message: error.message || 'An error occurred during file upload.'
			};
		}
	}

	/** Handle overwrite logic (delete existing if allowed). */
	private async handleFileOverwrite(
		currentDirectory: Directory,
		fileName: string,
		overwrite: boolean
	): Promise<UploadResult> {
		const existingFile = currentDirectory.contents.find(
			item => item.type === 'file' && item.name === fileName
		);

		if (existingFile) {
			if (!overwrite) {
				return {
					success: false,
					message: `File "${fileName}" already exists in this directory`,
					requiresConfirmation: true
				};
			} else {
				const deleteResult = await this.deleteItem(existingFile, false);
				if (!deleteResult.success) {
					return {
						success: false,
						message: `Failed to overwrite existing file: ${deleteResult.message}`
					};
				}
			}
		}

		return { success: true };
	}

	/** Perform actual multi-chunk upload for a file. */
	private async performFileUpload(
		file: globalThis.File,
		fileName: string
	): Promise<UploadResult> {
		const metadataSizeEstimate = await this.estimateFileMetadataSize(fileName, file.size);
		const fileBuffer = await file.arrayBuffer();
		const totalSize = fileBuffer.byteLength;
		const numChunks = Math.ceil(totalSize / this.CHUNK_SIZE);

		// Initialize progress tracking
		this.updateUploadProgress({
			fileName,
			progress: 0,
			isUploading: true,
			chunksUploaded: 0,
			totalChunks: numChunks
		});

		const chunkIds = await this.uploadFileChunks(
			fileBuffer,
			totalSize,
			numChunks,
			fileName,
			metadataSizeEstimate
		);

		// Add file to directory and update
		await this.addFileToDirectory(fileName, file.size, chunkIds);

		// Complete progress tracking
		this.updateUploadProgress({
			fileName,
			progress: 100,
			isUploading: false,
			chunksUploaded: numChunks,
			totalChunks: numChunks
		});

		return { success: true };
	}

	/** Slice file buffer, encrypt & upload chunks sequentially. */
	private async uploadFileChunks(
		fileBuffer: ArrayBuffer,
		totalSize: number,
		numChunks: number,
		fileName: string,
		metadataSizeEstimate: number
	): Promise<string[]> {
		const chunkIds: string[] = [];

		for (let i = 0; i < numChunks; i++) {
			const start = i * this.CHUNK_SIZE;
			const end = Math.min(start + this.CHUNK_SIZE, totalSize);
			const chunkData = fileBuffer.slice(start, end);

			const dataReservationSize = i === 0 ? metadataSizeEstimate + totalSize : 0;

			const chunkId = await this.uploadFileChunk(chunkData, dataReservationSize);
			chunkIds.push(chunkId);

			// Update progress
			const progress = Math.round(((i + 1) / numChunks) * 100);
			this.updateUploadProgress({
				fileName,
				progress,
				isUploading: true,
				chunksUploaded: i + 1,
				totalChunks: numChunks
			});
		}

		return chunkIds;
	}

	/** Add uploaded file metadata then persist directory. */
	private async addFileToDirectory(
		fileName: string,
		fileSize: number,
		chunkIds: string[]
	): Promise<void> {
		const currentDirectory = this.validateCurrentDirectory();

		currentDirectory.contents.push({
			type: 'file',
			name: fileName,
			size: fileSize,
			createdAt: new Date().toISOString(),
			fileChunks: chunkIds
		});

		await this.updateDirectory();
	}

	/** Upload multiple files with aggregated progress. */
	public async uploadMultipleFiles(
		files: FileList,
		overwriteConflicts: boolean = false
	): Promise<UploadResult> {
		try {
			this.validateStorageNode();
			if (!files || files.length === 0) {
				return {
					success: false,
					message: 'No files provided for upload.'
				};
			}

			const uploadStats = {
				uploaded: 0,
				failed: 0,
				skipped: 0,
				errors: [] as string[]
			};
			const totalFiles = files.length;

			for (let i = 0; i < files.length; i++) {
				const file = files[i];

				this.updateMultipleFilesProgress(
					file.name,
					i + 1,
					totalFiles,
					uploadStats.uploaded
				);

				await this.processFileUpload(file, overwriteConflicts, uploadStats);
			}

			// Complete progress tracking
			this.updateUploadProgress({
				fileName: '',
				progress: 100,
				isUploading: false,
				chunksUploaded: uploadStats.uploaded,
				totalChunks: totalFiles
			});

			return this.buildMultipleFilesResult(uploadStats, totalFiles);
		} catch (error: any) {
			this.resetUploadProgress();
			return {
				success: false,
				message: error.message || 'An error occurred during multiple file upload.'
			};
		}
	}

	/** Update multi-file progress line. */
	private updateMultipleFilesProgress(
		fileName: string,
		current: number,
		total: number,
		uploaded: number
	): void {
		this.updateUploadProgress({
			fileName: `${fileName} (${current}/${total})`,
			progress: Math.round((uploaded / total) * 100),
			isUploading: true,
			chunksUploaded: uploaded,
			totalChunks: total
		});
	}

	/** Upload one file within multi-file session. */
	private async processFileUpload(
		file: File,
		overwriteConflicts: boolean,
		stats: { uploaded: number; failed: number; skipped: number; errors: string[] }
	): Promise<void> {
		try {
			const result = await this.uploadFile(file, file.name, overwriteConflicts);

			if (result.success) {
				stats.uploaded++;
			} else if (result.requiresConfirmation && !overwriteConflicts) {
				stats.skipped++;
			} else {
				stats.failed++;
				stats.errors.push(`${file.name}: ${result.message}`);
			}
		} catch (error: any) {
			stats.failed++;
			stats.errors.push(`${file.name}: ${error.message || 'Unknown error'}`);
		}
	}

	/** Build result summary for multi-file upload. */
	private buildMultipleFilesResult(
		stats: { uploaded: number; failed: number; skipped: number; errors: string[] },
		totalFiles: number
	): UploadResult {
		// Summarize outcome: success if at least one uploaded; include counts for clarity
		if (stats.failed === 0 && stats.skipped === 0) {
			return { success: true, message: `All ${stats.uploaded} files uploaded successfully` };
		} else if (stats.uploaded === 0) {
			return {
				success: false,
				message: `All uploads failed: ${stats.errors.join('; ')}`
			};
		} else {
			const messages = [] as string[];
			if (stats.uploaded > 0) messages.push(`${stats.uploaded} uploaded`);
			if (stats.skipped > 0) messages.push(`${stats.skipped} skipped`);
			if (stats.failed > 0)
				messages.push(`${stats.failed} failed: ${stats.errors.join('; ')}`);
			return {
				success: stats.uploaded > 0,
				message: messages.join(', ')
			};
		}
	}

	/** Upload entire directory tree (HTML5 directory selection). */
	public async uploadDirectory(files: FileList): Promise<{ success: boolean; message?: string }> {
		if (!this.storageNodeId) {
			return {
				success: false,
				message: 'No active storage node selected.'
			};
		}
		if (!files || files.length === 0) {
			return { success: false, message: 'No files provided for upload.' };
		}

		try {
			// Store the original directory to return to
			const originalDirectory = this.directory.getValue();
			if (!originalDirectory) {
				return {
					success: false,
					message: 'Current directory is not initialized'
				};
			}

			// Build directory structure and create directories
			const directoryMap = await this.buildAndCreateDirectoryStructure(files);

			// Upload all files to their respective directories
			const result = await this.uploadFilesToDirectories(files, directoryMap);

			// Ensure we're back at the original directory
			await this.changeDirectory(originalDirectory.chunkId);

			return result;
		} catch (error: any) {
			return {
				success: false,
				message: error.message || 'An error occurred during directory upload.'
			};
		}
	}

	/** Build + create needed directory hierarchy for batch upload. */
	private async buildAndCreateDirectoryStructure(files: FileList): Promise<Map<string, string>> {
		// Map of directory path -> chunkId for fast lookup during file uploads
		const directoryMap = new Map<string, string>();
		const originalDirectory = this.directory.getValue();
		if (!originalDirectory) {
			throw new Error('Current directory is not initialized');
		}

		// Add current directory as root
		directoryMap.set('', originalDirectory.chunkId);

		// Collect all unique directory paths that need to be created
		const allPaths = new Set<string>();
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const relativePath = (file as any).webkitRelativePath || file.name;
			const pathParts = relativePath.split('/');

			// If file is in subdirectories, collect all parent paths
			if (pathParts.length > 1) {
				// Remove filename, keep directory path
				const dirParts = pathParts.slice(0, -1);

				// Add all parent paths (e.g., for "a/b/c", add "a" and "a/b")
				for (let j = 1; j <= dirParts.length; j++) {
					const path = dirParts.slice(0, j).join('/');
					allPaths.add(path);
				}
			}
		}

		// Sort paths by depth to create parent directories first
		const sortedPaths = Array.from(allPaths).sort((a, b) => {
			return a.split('/').length - b.split('/').length;
		});

		// Create directories iteratively
		for (const path of sortedPaths) {
			const pathParts = path.split('/');
			const dirName = pathParts[pathParts.length - 1];
			const parentPath = pathParts.slice(0, -1).join('/');

			// Get parent directory chunkId
			const parentChunkId = directoryMap.get(parentPath);
			if (!parentChunkId) {
				throw new Error(`Parent directory not found for path: ${path}`);
			}

			// Navigate to parent directory
			await this.changeDirectory(parentChunkId);

			// Check if directory already exists
			const currentDir = this.directory.getValue();
			if (!currentDir) {
				throw new Error('Failed to navigate to parent directory');
			}

			let dirChunkId = '';
			const existingDir = currentDir.contents.find(
				item => item.type === 'directory' && item.name === dirName
			);

			if (existingDir && existingDir.type === 'directory') {
				// Directory already exists
				dirChunkId = existingDir.chunkId;
			} else {
				// Create new directory
				const result = await this.createSubdirectory(dirName);
				if (!result.success) {
					throw new Error(`Failed to create directory ${dirName}: ${result.message}`);
				}

				// Get the newly created directory's chunkId
				const updatedDir = this.directory.getValue();
				if (!updatedDir) {
					throw new Error('Failed to get updated directory after creation');
				}

				const newDir = updatedDir.contents.find(
					item => item.type === 'directory' && item.name === dirName
				);

				if (!newDir || newDir.type !== 'directory') {
					throw new Error(`Failed to find newly created directory: ${dirName}`);
				}

				dirChunkId = newDir.chunkId;
			}

			// Store the mapping
			directoryMap.set(path, dirChunkId);
		}

		return directoryMap;
	}

	/** Upload files into their target directories. */
	private async uploadFilesToDirectories(
		files: FileList,
		directoryMap: Map<string, string>
	): Promise<{ success: boolean; message?: string }> {
		const totalFiles = files.length;
		let uploadedFiles = 0;
		let failedFiles = 0;
		const errors: string[] = [];

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const relativePath = (file as any).webkitRelativePath || file.name;
			const pathParts = relativePath.split('/');
			const fileName = pathParts[pathParts.length - 1];

			// Update progress
			this.uploadProgress.next({
				fileName: `${relativePath} (${i + 1}/${totalFiles})`,
				progress: Math.round((uploadedFiles / totalFiles) * 100),
				isUploading: true,
				chunksUploaded: uploadedFiles,
				totalChunks: totalFiles
			});

			try {
				// Determine target directory path
				let targetDirectoryPath = '';
				if (pathParts.length > 1) {
					targetDirectoryPath = pathParts.slice(0, -1).join('/');
				}

				// Get the target directory chunkId
				const targetChunkId = directoryMap.get(targetDirectoryPath);
				if (!targetChunkId) {
					throw new Error(`Target directory not found for path: ${targetDirectoryPath}`);
				}

				// Navigate to target directory
				await this.changeDirectory(targetChunkId);

				// Upload the file
				const result = await this.uploadFile(file, fileName, true); // Always overwrite in directory uploads
				if (result.success) {
					uploadedFiles++;
				} else {
					failedFiles++;
					errors.push(`${relativePath}: ${result.message}`);
				}
			} catch (error: any) {
				failedFiles++;
				errors.push(`${relativePath}: ${error.message || 'Unknown error'}`);
			}
		}

		// Complete progress tracking
		this.uploadProgress.next({
			fileName: '',
			progress: 100,
			isUploading: false,
			chunksUploaded: uploadedFiles,
			totalChunks: totalFiles
		});

		// Build standardized message similar to buildMultipleFilesResult
		const parts: string[] = [];
		parts.push(`uploaded: ${uploadedFiles}`);
		parts.push(`failed: ${failedFiles}`);
		const baseMessage = `Directory upload summary (${uploadedFiles + failedFiles}/${totalFiles} processed)`;
		if (failedFiles > 0) {
			parts.push(`errors: ${errors.join('; ')}`);
		}
		const message = `${baseMessage} => ${parts.join(', ')}`;
		// Success if at least one file uploaded
		return {
			success: uploadedFiles > 0 && failedFiles === 0 ? true : uploadedFiles > 0,
			message
		};
	}

	/** Encrypt + upload a single chunk (prepare, send, complete). */
	private async uploadFileChunk(data: ArrayBuffer, data_size: number): Promise<string> {
		this.validateStorageNode();
		// Prepare upload session
		const { chunkId, uploadUrl, temporaryObjectName } =
			await this.prepareUploadSession(data_size);
		// Encrypt and upload data
		await this.encryptAndUploadChunk(data, uploadUrl);
		// Complete the transfer
		await this.completeChunkTransfer(chunkId, temporaryObjectName);
		return chunkId;
	}

	/** Prepare upload session (reserve space, get URL). */
	private async prepareUploadSession(data_size: number): Promise<{
		chunkId: string;
		uploadUrl: string;
		temporaryObjectName: string;
	}> {
		const prepareResponse = await firstValueFrom(
			this.http.post<any>(
				`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/upload-sessions`,
				{ data_size },
				{ headers: this.authHeaders }
			)
		);
		if (!prepareResponse.success) {
			throw new Error(prepareResponse.message || 'Failed to prepare upload.');
		}
		return prepareResponse.data;
	}

	/** Encrypt bytes and PUT to pre-signed URL. */
	private async encryptAndUploadChunk(data: ArrayBuffer, uploadUrl: string): Promise<void> {
		const { encryptedData, iv } = await this.cryptoService.encryptData(new Uint8Array(data));
		const finalPayload = new Uint8Array(iv.length + encryptedData.byteLength);
		finalPayload.set(iv);
		finalPayload.set(new Uint8Array(encryptedData), iv.length);
		await firstValueFrom(
			this.http.put(uploadUrl, new Blob([finalPayload]), {
				headers: { 'Content-Type': 'application/octet-stream' }
			})
		);
	}

	/** Finalize chunk transfer (promote temp object). */
	private async completeChunkTransfer(
		chunkId: string,
		temporaryObjectName: string
	): Promise<void> {
		const completeResponse = await firstValueFrom(
			this.http.put<any>(
				`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}`,
				{ temporaryObjectName },
				{ headers: this.authHeaders }
			)
		);
		if (!completeResponse.success) {
			throw new Error(completeResponse.message || 'Backend failed to complete the transfer.');
		}
	}

	/** Download full file (chunks) and return Blob. */
	public async downloadFile(item: DirectoryItem): Promise<Blob> {
		this.validateStorageNode();
		this.validateCurrentDirectory();

		if (item.type !== 'file') {
			throw new Error('Selected item is not a file.');
		}

		try {
			// Initialize download progress tracking
			const totalChunks = item.fileChunks.length;
			this.updateDownloadProgress({
				fileName: item.name,
				progress: 0,
				isDownloading: true,
				chunksDownloaded: 0,
				totalChunks: totalChunks
			});

			const decryptedChunks = await this.downloadAndDecryptChunks(item, totalChunks);
			const reassembledBlob = this.reassembleFileChunks(decryptedChunks, item.size);

			// Complete download progress tracking
			this.updateDownloadProgress({
				fileName: item.name,
				progress: 100,
				isDownloading: false,
				chunksDownloaded: totalChunks,
				totalChunks: totalChunks
			});

			return reassembledBlob;
		} catch (error) {
			this.resetDownloadProgress();
			throw error;
		}
	}

	/** Download & decrypt all file chunks with progress. */
	private async downloadAndDecryptChunks(
		item: DirectoryItem & { type: 'file' },
		totalChunks: number
	): Promise<ArrayBuffer[]> {
		const decryptedChunks: ArrayBuffer[] = [];

		for (let i = 0; i < item.fileChunks.length; i++) {
			const dataChunkId = item.fileChunks[i];
			const decryptedChunk = await this.downloadFileChunk(dataChunkId);
			decryptedChunks.push(decryptedChunk);

			// Update progress
			const chunksDownloaded = i + 1;
			const progress = Math.round((chunksDownloaded / totalChunks) * 100);
			this.updateDownloadProgress({
				fileName: item.name,
				progress,
				isDownloading: true,
				chunksDownloaded,
				totalChunks
			});
		}

		return decryptedChunks;
	}

	/** Reassemble decrypted chunks into Blob. */
	private reassembleFileChunks(decryptedChunks: ArrayBuffer[], totalSize: number): Blob {
		const reassembledBuffer = new Uint8Array(totalSize);
		let offset = 0;

		for (const chunk of decryptedChunks) {
			reassembledBuffer.set(new Uint8Array(chunk), offset);
			offset += chunk.byteLength;
		}

		return new Blob([reassembledBuffer]);
	}

	/** Download directory recursively as ZIP. */
	public async downloadDirectory(item: DirectoryItem): Promise<Blob> {
		this.validateStorageNode();

		if (item.type !== 'directory') {
			throw new Error('Selected item is not a directory.');
		}

		try {
			const zipFileName = `${item.name}.zip`;

			// Initialize download progress tracking for directory
			this.updateDownloadProgress({
				fileName: zipFileName,
				progress: 0,
				isDownloading: true,
				chunksDownloaded: 0,
				totalChunks: 0
			});

			const originalDirectory = this.validateCurrentDirectory();
			const zip = new JSZip();

			// Recursively add directory contents to ZIP
			await this.addDirectoryToZip(zip, item, '');

			// Return to original directory
			await this.changeDirectory(originalDirectory.chunkId);

			// Generate ZIP file
			const zipBlob = await zip.generateAsync({ type: 'blob' });

			// Complete download progress tracking
			this.updateDownloadProgress({
				fileName: zipFileName,
				progress: 100,
				isDownloading: false,
				chunksDownloaded: 0,
				totalChunks: 0
			});

			return zipBlob;
		} catch (error) {
			this.resetDownloadProgress();
			throw error;
		}
	}

	/** Recursively add directory contents to ZIP. */
	private async addDirectoryToZip(
		zip: JSZip,
		directoryItem: DirectoryItem,
		basePath: string
	): Promise<void> {
		if (directoryItem.type !== 'directory') {
			return;
		}

		// Navigate to the directory
		await this.changeDirectory(directoryItem.chunkId);

		// Get directory contents
		const directory = this.validateCurrentDirectory();

		// Create the directory path in ZIP
		const currentPath = basePath ? `${basePath}/${directoryItem.name}` : directoryItem.name;

		zip.folder(currentPath);

		// Process all items in this directory
		await this.processDirectoryItems(zip, directory.contents, currentPath);
	}

	/** Process items (files/subdirs) for ZIP. */
	private async processDirectoryItems(
		zip: JSZip,
		items: DirectoryItem[],
		currentPath: string
	): Promise<void> {
		for (const item of items) {
			if (item.type === 'file') {
				await this.addFileToZip(zip, item, currentPath);
			} else if (item.type === 'directory') {
				// Recursively add subdirectory
				await this.addDirectoryToZip(zip, item, currentPath);
			}
		}
	}

	/** Download, decrypt and add file to ZIP. */
	private async addFileToZip(
		zip: JSZip,
		item: DirectoryItem & { type: 'file' },
		currentPath: string
	): Promise<void> {
		try {
			// Download file content
			const fileBlob = await this.downloadFile(item);

			// Add file to ZIP
			zip.file(`${currentPath}/${item.name}`, fileBlob);

			// Update progress
			this.updateDownloadProgress({
				fileName: `${currentPath}/${item.name}`,
				progress: 50,
				isDownloading: true,
				chunksDownloaded: 0,
				totalChunks: 0
			});
		} catch (error) {
			console.warn(`Failed to download file ${item.name}:`, error);
			// Continue with other files instead of failing completely
		}
	}

	/** Download & decrypt single chunk (session lifecycle). */
	private async downloadFileChunk(chunkId: string): Promise<ArrayBuffer> {
		this.validateStorageNode();

		try {
			// Prepare download session
			const { downloadUrl, temporaryObjectName } = await this.prepareDownloadSession(chunkId);

			// Download and decrypt data
			const decryptedData = await this.downloadAndDecryptChunk(downloadUrl);

			// Cleanup temporary object
			await this.cleanupDownloadSession(chunkId, temporaryObjectName);

			return decryptedData;
		} catch (error: any) {
			throw new Error(
				error.message || `An unknown error occurred during download of chunk ${chunkId}.`
			);
		}
	}

	/** Prepare download session (signed URL). */
	private async prepareDownloadSession(
		chunkId: string
	): Promise<{ downloadUrl: string; temporaryObjectName: string }> {
		const prepareResponse = await firstValueFrom(
			this.http.post<any>(
				`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}/download-sessions`,
				{},
				{ headers: this.authHeaders }
			)
		);

		if (!prepareResponse.success) {
			throw new Error(prepareResponse.message || 'Failed to prepare download.');
		}

		return prepareResponse.data;
	}

	/** GET encrypted chunk via signed URL then decrypt. */
	private async downloadAndDecryptChunk(downloadUrl: string): Promise<ArrayBuffer> {
		const encryptedFileBuffer = await firstValueFrom(
			this.http.get(downloadUrl, { responseType: 'arraybuffer' })
		);

		const encryptedDataWithIv = new Uint8Array(encryptedFileBuffer);
		if (encryptedDataWithIv.length < 12) {
			throw new Error('Downloaded data is too short to be valid.');
		}

		const iv = encryptedDataWithIv.slice(0, 12);
		const encryptedContent = encryptedDataWithIv.slice(12);

		return await this.cryptoService.decryptData(encryptedContent.buffer, iv);
	}

	/** Best-effort cleanup of temporary download object. */
	private async cleanupDownloadSession(
		chunkId: string,
		temporaryObjectName: string
	): Promise<void> {
		try {
			await firstValueFrom(
				this.http.delete(
					`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}/download-sessions`,
					{ headers: this.authHeaders, body: { temporaryObjectName } }
				)
			);
		} catch (cleanupError) {
			// Log cleanup error but don't fail the download
			console.warn(
				`Failed to cleanup temporary object ${temporaryObjectName}:`,
				cleanupError
			);
		}
	}

	/** Estimate directory metadata growth for file upload. */
	async estimateFileMetadataSize(fileName: string, fileSize: number): Promise<number> {
		const currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			throw new Error('Current directory is not initialized');
		}

		// Use Math.ceil to ensure we reflect the actual number of chunks allocated elsewhere
		const num_chunks = Math.ceil(fileSize / this.CHUNK_SIZE);
		const chunkIdArr = Array.from(
			{ length: num_chunks },
			(_, i) => `temp-mock-file-id-${i.toString().padStart(8, '0')}-mock-uuid`
		);

		const mockFileItem: DirectoryItem = {
			type: 'file',
			name: fileName,
			size: fileSize,
			createdAt: new Date().toISOString(),
			fileChunks: chunkIdArr
		};

		const mockDirectory = {
			...currentDirectory,
			contents: [...currentDirectory.contents, mockFileItem]
		};

		const currentJsonString = JSON.stringify(currentDirectory);
		const mockJsonString = JSON.stringify(mockDirectory);

		const currentSize = new TextEncoder().encode(currentJsonString).length;
		const mockSize = new TextEncoder().encode(mockJsonString).length;

		const sizeDifference = mockSize - currentSize;
		const estimatedSize = sizeDifference + 32; // encryption overhead buffer

		return Math.max(estimatedSize, 300);
	}
}
