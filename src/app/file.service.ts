// src/app/file.service.ts

import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { BehaviorSubject } from "rxjs";
import { AuthService } from "./auth.service";
import { CryptoService } from "./crypto.service";
import { firstValueFrom } from "rxjs";

export interface Directory {
	name: string;
	chunkId: string;
	parentId: string;
	contents: DirectoryItem[];
}

export type DirectoryItem =
	| {
			type: "directory";
			name: string;
			chunkId: string;
	  }
	| {
			type: "file";
			name: string;
			size: number;
			createdAt: string;
			fileChunks: string[];
	  };

@Injectable({
	providedIn: "root",
})
export class FileService {
	private apiUrl: string;
	private apiHeaders: HttpHeaders;

	// Directory state
	private directory = new BehaviorSubject<Directory | null>(null);
	private storageNodeId: string | null = null;

	// WebRTC properties
	public peerConnection: RTCPeerConnection | null = null;
	public dataChannel: RTCDataChannel | null = null;
	public webrtcReady: boolean = false;

	private readonly CHUNK_SIZE = 256 * 1024 * 1024; // 256 MB

	constructor(
		private http: HttpClient,
		private authService: AuthService,
		private cryptoService: CryptoService
	) {
		this.apiUrl = this.authService.getApiUrl();
		this.apiHeaders = this.authService.getAuthHeaders();
	}

	getCurrentDirectory(): Directory | null {
		return this.directory.getValue();
	}

	async initializePage(
		password: string,
		nodeId: string
	): Promise<{ success: boolean; message?: string }> {
		this.storageNodeId = nodeId;

		// Get the root chunk
		const rootChunkId = await this.cryptoService.getRootChunk(password);

		try {
			// Try and fetch the root directory
			const jsonString = await this.fetchAndDecryptChunk(rootChunkId);

			// If we got data back, parse it and set as current directory
			if (jsonString) {
				const directoryData = JSON.parse(jsonString) as Directory;
				const clonedDirectory = structuredClone(directoryData);
				this.directory.next(clonedDirectory);
			}
			return { success: true };
		} catch (error: any) {
			if (error?.status === 404 && error.message?.includes("not found")) {
				try {
					const newRoot = await this.createDirectory(
						"",
						"",
						rootChunkId
					);
					this.directory.next(newRoot);
					return { success: true };
				} catch (creationError: any) {
					return {
						success: false,
						message: `Failed to create a new root chunk: ${
							creationError.message || creationError
						}`,
					};
				}
			}

			return {
				success: false,
				message: `Error retrieving root chunk: ${
					error.message || error
				}`,
			};
		}
	}

	private async createDirectory(
		name: string,
		parentId: string,
		chunkId?: string
	): Promise<Directory> {
		try {
			// Create a new directory
			let newDirectory: Directory = {
				chunkId: chunkId || this.cryptoService.generateUUID(),
				name,
				parentId: parentId,
				contents: [],
			};

			newDirectory = await this.storeDirectory(newDirectory);

			return newDirectory;
		} catch (error) {
			throw error;
		}
	}

	private async updateDirectory(): Promise<void> {
		if (!this.storageNodeId) {
			throw new Error("Node ID not available");
		}

		let currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			throw new Error("Current directory is not initialized");
		}

		try {
			// Delete old directory metadata
			await this.deleteChunk(currentDirectory.chunkId);

			// Store updated directory metadata
			currentDirectory = await this.storeDirectory(currentDirectory);

			// Update the local state with a deep clone to trigger observable and UI update
			const updatedDirectory: Directory =
				structuredClone(currentDirectory);
			this.directory.next(updatedDirectory);
		} catch (error) {
			throw error;
		}
	}

	private async storeDirectory(directory: Directory): Promise<Directory> {
		if (!this.storageNodeId) {
			throw new Error("Node ID not available");
		}

		do {
			try {
				await this.encryptAndStoreChunk(
					JSON.stringify(directory),
					directory.chunkId
				);
				break;
			} catch (error: any) {
				// Chunk ID conflict, generate a new one and retry
				if (error?.status === 409) {
					// Collision with a root chunk should theoretically never be possible
					directory.chunkId = this.cryptoService.generateUUID();
					continue;
				} else {
					throw error; // Propagate other errors for handling
				}
			}
		} while (true);

		// Return the directory if there was an update to chunkID
		return directory;
	}

	public async createSubdirectory(
		name: string
	): Promise<{ success: boolean; message?: string }> {
		if (!this.storageNodeId) {
			return {
				success: false,
				message: "Node ID not available",
			};
		}

		const currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			return {
				success: false,
				message: "Current directory is not initialized",
			};
		}

		// Check if directory name already exists
		const existingDir = currentDirectory.contents.find(
			(d) => d.name === name
		);
		if (existingDir) {
			return {
				success: false,
				message: `Directory "${name}" already exists`,
			};
		}

		try {
			// Create the new directory
			const newDirectory = await this.createDirectory(
				name,
				currentDirectory.chunkId
			);

			// Add the new directory to the current directory
			currentDirectory.contents = [
				...currentDirectory.contents,
				{
					type: "directory",
					name: newDirectory.name,
					chunkId: newDirectory.chunkId,
				},
			];

			// Update the directory metadata
			await this.updateDirectory();

			return { success: true };
		} catch (error) {
			return {
				success: false,
				message: `Error Creating Subdirectory: ${error}`,
			};
		}
	}

	public async changeDirectory(
		directoryChunkId: string
	): Promise<{ success: boolean; message?: string }> {
		if (!this.storageNodeId) {
			return {
				success: false,
				message: "Node ID not available",
			};
		}

		try {
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
				message: `Error changing directory ${error}`,
			};
		}
	}

	public async leaveDirectory(): Promise<{
		success: boolean;
		message?: string;
	}> {
		const currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			return {
				success: false,
				message: "Current directory is not initialized",
			};
		}
		return this.changeDirectory(currentDirectory.parentId);
	}

	public async getDirectoryContents(): Promise<DirectoryItem[]> {
		const currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			return [];
		}

		// Filter and sort directories and files, then concatenate
		const directories = currentDirectory.contents
			.filter((item) => item.type === "directory")
			.sort((a, b) => a.name.localeCompare(b.name));
		const files = currentDirectory.contents
			.filter((item) => item.type === "file")
			.sort((a, b) => a.name.localeCompare(b.name));

		return [...directories, ...files];
	}

	private async fetchAndDecryptChunk(chunkId: string): Promise<string> {
		if (!this.storageNodeId) {
			throw new Error("Node ID not available");
		}

		try {
			const response: any = await firstValueFrom(
				this.http.get(
					`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}`,
					{
						headers: this.apiHeaders,
						responseType: "arraybuffer" as "arraybuffer",
					}
				)
			);

			if (!response || response.byteLength === 0) {
				throw new Error("No data received when fetching chunk");
			}

			const responseBuffer = new Uint8Array(response);

			if (responseBuffer.length < 12) {
				throw new Error("Invalid chunk data: too short");
			}

			// Extract IV and encrypted content
			const iv = responseBuffer.slice(0, 12);
			const encryptedContent = responseBuffer.slice(12);

			// Convert encrypted content to ArrayBuffer for decryption
			const encryptedArrayBuffer = encryptedContent.buffer.slice(
				encryptedContent.byteOffset,
				encryptedContent.byteOffset + encryptedContent.byteLength
			);

			const decryptedData = await this.cryptoService.decryptData(
				encryptedArrayBuffer,
				iv
			);
			const jsonString = new TextDecoder().decode(decryptedData);

			return jsonString;
		} catch (error) {
			const errAny = error as any;
			if (errAny && errAny.error instanceof ArrayBuffer) {
				let errorString = "";
				try {
					errorString = new TextDecoder().decode(errAny.error);
				} catch (e) {
					errorString = "";
				}
				// Try to parse as JSON
				let jsonError: any = null;
				try {
					jsonError = JSON.parse(errorString);
				} catch (e) {
					// Not JSON, fallback to string
				}
				if (
					jsonError &&
					typeof jsonError === "object" &&
					jsonError.error
				) {
					const err: any = new Error(jsonError.error);
					if (errAny.status) err.status = errAny.status;
					throw err;
				} else {
					const err: any = new Error(errorString || "Unknown error");
					if (errAny.status) err.status = errAny.status;
					throw err;
				}
			}
			throw error;
		}
	}

	private async encryptAndStoreChunk(
		data: string,
		chunkId: string
	): Promise<void> {
		if (!this.storageNodeId) {
			throw new Error("Node ID not available");
		}

		// Encrypt the chunk data
		const dataBuffer = new TextEncoder().encode(data);
		const { encryptedData, iv: encryptionIv } =
			await this.cryptoService.encryptData(dataBuffer);

		// Prepend IV to encrypted data
		const finalData = new ArrayBuffer(
			encryptionIv.length + encryptedData.byteLength
		);
		const finalView = new Uint8Array(finalData);
		finalView.set(encryptionIv);
		finalView.set(new Uint8Array(encryptedData), encryptionIv.length);

		try {
			await firstValueFrom(
				this.http.post(
					`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}`,
					new Blob([finalData]),
					{
						headers: this.apiHeaders.set(
							"Content-Type",
							"application/octet-stream"
						),
					}
				)
			);
		} catch (error) {
			throw error;
		}
	}

	private async deleteChunk(chunkId: string): Promise<void> {
		if (!this.storageNodeId) {
			throw new Error("Node ID not available");
		}
		try {
			await firstValueFrom(
				this.http.delete(
					`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}`,
					{ headers: this.apiHeaders }
				)
			);
		} catch (error) {
			throw error;
		}
	}

	public async deleteItem(
		item: DirectoryItem
	): Promise<{ success: boolean; message?: string }> {
		if (!this.storageNodeId) {
			return {
				success: false,
				message: "Node ID not available",
			};
		}

		const currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			return {
				success: false,
				message: "Current directory is not initialized",
			};
		}

		// Check if item exists in the current directory
		const existingItem = currentDirectory.contents.find((i) => i === item);
		if (!existingItem) {
			return {
				success: false,
				message: "Item not found in current directory",
			};
		}

		if (item.type === "file") {
			try {
				// Delete all data chunks that make up this file
				for (const dataChunkId of item.fileChunks) {
					await this.deleteChunk(dataChunkId);
				}

				// Remove the file from the directory
				currentDirectory.contents = currentDirectory.contents.filter(
					(dirItem) => !(dirItem.type === "file" && dirItem === item)
				);

				// Update the directory metadata
				await this.updateDirectory();

				return { success: true };
			} catch (error) {
				return {
					success: false,
					message: `Error deleting file: ${error}`,
				};
			}
		} else if (item.type === "directory") {
			// Delete the directory and all its contents
			try {
				// First, fetch the directory to check if it's empty
				const targetDirectory = JSON.parse(
					await this.fetchAndDecryptChunk(item.chunkId)
				) as Directory;

				// Check if directory is empty
				if (targetDirectory.contents.length > 0) {
					return {
						success: false,
						message: `Cannot delete "${item.name}": Directory is not empty. Please delete all files and subdirectories first.`,
					};
				}

				// Delete the directory chunk from storage
				await this.deleteChunk(item.chunkId);

				// Remove the directory from the parent directory
				currentDirectory.contents = currentDirectory.contents.filter(
					(dirItem) =>
						!(
							dirItem.type === "directory" &&
							dirItem.chunkId === item.chunkId
						)
				);

				// Update the parent directory metadata
				await this.updateDirectory();

				return { success: true };
			} catch (error) {
				return {
					success: false,
					message: `Error deleting directory: ${error}`,
				};
			}
		} else {
			return {
				success: false,
				message: "Unknown item type. Cannot delete.",
			};
		}
	}

	public async uploadFile(
		file: globalThis.File,
		fileName: string
	): Promise<{ success: boolean; message?: string }> {
		if (!this.storageNodeId) {
			return {
				success: false,
				message: "No active storage node selected.",
			};
		}
		if (!file) {
			return { success: false, message: "No file provided for upload." };
		}

		try {
			const currentDirectory = this.directory.getValue();
			if (!currentDirectory) {
				return {
					success: false,
					message: "Current directory is not initialized",
				};
			}

			const metadataSizeEstimate = await this.estimateFileMetadataSize(
				fileName,
				file.size
			);
			const fileBuffer = await file.arrayBuffer();
			const totalSize = fileBuffer.byteLength;
			const numChunks = Math.ceil(totalSize / this.CHUNK_SIZE);
			const chunkIds: string[] = [];

			for (let i = 0; i < numChunks; i++) {
				const start = i * this.CHUNK_SIZE;
				const end = Math.min(start + this.CHUNK_SIZE, totalSize);
				const chunkData = fileBuffer.slice(start, end);

				const dataReservationSize =
					i === 0 ? metadataSizeEstimate + totalSize : 0;

				const chunkId = await this.uploadFileChunk(
					chunkData,
					dataReservationSize
				);
				chunkIds.push(chunkId);
			}

			// // After all data chunks are uploaded, create and upload the file metadata
			// let fileMetadataChunkId = this.cryptoService.generateUUID();
			// const newFile: FileItem = {
			//     chunkId: fileMetadataChunkId,
			//     name: fileName,
			//     size: file.size,
			//     createdAt: new Date().toISOString(),
			//     fileChunks: chunkIds
			// };

			// // Store file Metadata chunk with retry
			// do {
			//     try {
			//         await this.encryptAndStoreChunk(JSON.stringify(newFile), fileMetadataChunkId);
			//         break;
			//     } catch (error: any) {
			//         // If chunk ID conflict, generate a new one and retry
			//         if (error?.status === 409) {
			//             fileMetadataChunkId = this.cryptoService.generateUUID();
			//             newFile.chunkId = fileMetadataChunkId;
			//         } else {
			//             throw error; // Propagate other errors
			//         }
			//     }
			// } while (true);

			// Update the current directory to include the new file reference
			currentDirectory.contents.push({
				type: "file",
				name: fileName,
				size: file.size,
				createdAt: new Date().toISOString(),
				fileChunks: chunkIds,
			});

			await this.updateDirectory();

			return { success: true };
		} catch (error: any) {
			return {
				success: false,
				message:
					error.message || "An error occurred during file upload.",
			};
		}
	}

	private async uploadFileChunk(
		data: ArrayBuffer,
		data_size: number
	): Promise<string> {
		if (!this.storageNodeId)
			throw new Error("No active storage node selected.");

		const prepareResponse = await firstValueFrom(
			this.http.post<any>(
				`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/upload-sessions`,
				{ data_size: data_size },
				{ headers: this.apiHeaders }
			)
		);

		if (!prepareResponse.success)
			throw new Error(
				prepareResponse.error || "Failed to prepare upload."
			);

		const { chunkId, uploadUrl, temporaryObjectName } =
			prepareResponse.data;
		const { encryptedData, iv } = await this.cryptoService.encryptData(
			new Uint8Array(data)
		);

		const finalPayload = new Uint8Array(
			iv.length + encryptedData.byteLength
		);
		finalPayload.set(iv);
		finalPayload.set(new Uint8Array(encryptedData), iv.length);

		// Use Blob to ensure binary integrity
		await firstValueFrom(
			this.http.put(uploadUrl, new Blob([finalPayload]), {
				headers: { "Content-Type": "application/octet-stream" },
			})
		);

		const completeResponse = await firstValueFrom(
			this.http.put<any>(
				`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}`,
				{ temporaryObjectName },
				{ headers: this.apiHeaders }
			)
		);

		if (!completeResponse.success)
			throw new Error(
				completeResponse.error ||
					"Backend failed to complete the transfer."
			);
		return chunkId;
	}

	public async downloadFile(item: DirectoryItem): Promise<Blob> {
		if (!this.storageNodeId) {
			throw new Error("No active storage node selected.");
		}

		const currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			throw new Error("Current directory is not initialized");
		}

		if (item.type !== "file") {
			throw new Error("Selected item is not a file.");
		}

		// Download and decrypt all the data chunks listed in the metadata.
		const decryptedChunks: ArrayBuffer[] = [];
		for (const dataChunkId of item.fileChunks) {
			const decryptedChunk = await this.downloadFileChunk(dataChunkId);
			decryptedChunks.push(decryptedChunk);
		}

		// Reassemble the decrypted chunks into a single buffer.
		const totalSize = item.size;
		const reassembledBuffer = new Uint8Array(totalSize);
		let offset = 0;
		for (const chunk of decryptedChunks) {
			reassembledBuffer.set(new Uint8Array(chunk), offset);
			offset += chunk.byteLength;
		}

		// Return the final reassembled file as a Blob.
		return new Blob([reassembledBuffer]);
	}

	private async downloadFileChunk(chunkId: string): Promise<ArrayBuffer> {
		if (!this.storageNodeId) {
			throw new Error("No active storage node selected.");
		}
		try {
			const prepareResponse = await firstValueFrom(
				this.http.post<any>(
					`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}/download-sessions`,
					{},
					{ headers: this.apiHeaders }
				)
			);
			if (!prepareResponse.success)
				throw new Error(
					prepareResponse.error || "Failed to prepare download."
				);

			const { downloadUrl, temporaryObjectName } = prepareResponse.data;
			const encryptedFileBuffer = await firstValueFrom(
				this.http.get(downloadUrl, {
					responseType: "arraybuffer",
				})
			);

			const encryptedDataWithIv = new Uint8Array(encryptedFileBuffer);
			if (encryptedDataWithIv.length < 12)
				throw new Error("Downloaded data is too short to be valid.");

			const iv = encryptedDataWithIv.slice(0, 12);
			const encryptedContent = encryptedDataWithIv.slice(12);

			const decryptedData = await this.cryptoService.decryptData(
				encryptedContent.buffer,
				iv
			);

			// Cleanup the temporary object after successful download
			try {
				await firstValueFrom(
					this.http.delete(
						`${this.apiUrl}/nodes/${this.storageNodeId}/chunks/${chunkId}/download-sessions`,
						{
							headers: this.apiHeaders,
							body: { temporaryObjectName },
						}
					)
				);
			} catch (cleanupError) {
				// Log cleanup error but don't fail the download
				console.warn(
					`Failed to cleanup temporary object ${temporaryObjectName}:`,
					cleanupError
				);
			}

			return decryptedData;
		} catch (error: any) {
			throw new Error(
				error.message ||
					`An unknown error occurred during download of chunk ${chunkId}.`
			);
		}
	}

	async estimateFileMetadataSize(
		fileName: string,
		fileSize: number
	): Promise<number> {
		// Estimate the storage delta of a file upload
		const currentDirectory = this.directory.getValue();
		if (!currentDirectory) {
			throw new Error("Current directory is not initialized");
		}

		const num_chunks = fileSize / this.CHUNK_SIZE;

		const chunkIdArr = Array.from({ length: num_chunks }, (_, i) => {
			return `temp-mock-file-id-${i
				.toString()
				.padStart(8, "0")}-mock-uuid`;
		});

		// Create a mock file
		const mockFileItem: DirectoryItem = {
			type: "file",
			name: fileName,
			size: fileSize,
			createdAt: new Date().toISOString(),
			fileChunks: chunkIdArr,
		};

		// Create a mock directory structure with the new file added
		const mockDirectory = {
			...currentDirectory,
			contents: [...currentDirectory.contents, mockFileItem],
		};

		// Calculate the size difference more accurately
		const currentJsonString = JSON.stringify(currentDirectory);
		const mockJsonString = JSON.stringify(mockDirectory);

		const currentSize = new TextEncoder().encode(currentJsonString).length;
		const mockSize = new TextEncoder().encode(mockJsonString).length;

		// Calculate the difference + encryption overhead for the additional data
		const sizeDifference = mockSize - currentSize;
		const estimatedSize = sizeDifference + 32;

		return Math.max(estimatedSize, 300); // Minimum 300 bytes for any file addition
	}
}
