import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, isObservable } from 'rxjs';
import { AuthService } from './auth.service';
import { CryptoService } from './crypto.service';
import { firstValueFrom } from 'rxjs';

export interface File {
  chunkId: string;
  name: string;
  size: number;
  createdAt: string;
  iv: string;
  fileChunks: string[];
}

export interface Directory {
  chunkId: string;
  name: string;
  parentId: string;
  contents: DirectoryItem[];
}

export type DirectoryItem = {
  type: 'directory';
  name: string;
  chunkId: string;
} | {
  type: 'file';
  name: string;
  size: number;
  createdAt: string;
  chunkId: string;
};

@Injectable({
  providedIn: 'root'
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

  async initializePage(password: string, nodeId: string): Promise<{success: boolean, message?: string}> {
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
      if (error?.status === 404 && error.message?.includes('not found')) {
        try {
          const newRoot = await this.createDirectory("", "", rootChunkId);
          this.directory.next(newRoot);
          return { success: true };
        } catch (creationError: any) {
          return {
            success: false,
            message: `Failed to create a new root chunk: ${creationError.message || creationError}`
          };
        }
      }

      return {
        success: false,
        message: `Error retrieving root chunk: ${error.message || error}`
      };
    }
  }

  private async createDirectory(name: string, parentId: string, chunkId?: string): Promise<Directory> {
    try {
      // Create a new directory
      let newDirectory: Directory = { 
        chunkId: chunkId || this.cryptoService.generateUUID(), 
        name, 
        parentId: parentId, 
        contents: []
      };

      newDirectory = await this.storeDirectory(newDirectory);

      return newDirectory;
    } catch (error) {
      throw error;
    }
  }

  private async updateDirectory(): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    let currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    try {
      // Delete old directory metadata
      await this.deleteChunk(currentDirectory.chunkId);

      // Store updated directory metadata
      currentDirectory = await this.storeDirectory(currentDirectory);

      // Update the local state with a deep clone to trigger observable and UI update
      const updatedDirectory: Directory = structuredClone(currentDirectory);
      this.directory.next(updatedDirectory);
    } catch (error) {
      throw error;
    }
  }

  private async storeDirectory(directory: Directory): Promise<Directory> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    do {
      try {
        await this.encryptAndStoreChunk(JSON.stringify(directory), directory.chunkId);
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

  public async deleteDirectory(directoryChunkId: string): Promise<{success: boolean, message?: string}> {
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

    // Find the directory to delete
    const directoryToDelete = currentDirectory.contents.find(item => item.type === 'directory' && item.chunkId === directoryChunkId) as DirectoryItem | undefined;

    if (!directoryToDelete) {
      return {
        success: false,
        message: 'Directory not found in current directory'
      };
    }

    try {
      // First, fetch the directory to check if it's empty
      const targetDirectory = JSON.parse(await this.fetchAndDecryptChunk(directoryChunkId)) as Directory;

      // Check if directory is empty
      if (targetDirectory.contents.length > 0) {
        return {
          success: false,
          message: `Cannot delete "${directoryToDelete.name}": Directory is not empty. Please delete all files and subdirectories first.`
        };
      }
      
      // Delete the directory chunk from storage
      await this.deleteChunk(directoryChunkId);
      
      // Remove the directory from the parent directory
      currentDirectory.contents = currentDirectory.contents.filter(item => item.chunkId !== directoryToDelete.chunkId);
      
      // Update the parent directory metadata
      await this.updateDirectory();
      
      return { success: true };
      
    } catch (error) {
      return {
        success: false,
        message: `Error deleting directory: ${error}`
      };
    }
  }

  public async createSubdirectory(name: string): Promise<{success: boolean, message?: string}> {
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

    // Check if directory name already exists
    const existingDir = currentDirectory.contents.find(d => d.name === name);
    if (existingDir) {
      return {
        success: false,
        message: `Directory "${name}" already exists`
      };
    }

    try {
      // Create the new directory
      const newDirectory = await this.createDirectory(name, currentDirectory.chunkId);

      // Add the new directory to the current directory
      currentDirectory.contents = [...currentDirectory.contents, {
        type: 'directory',
        name: newDirectory.name,
        chunkId: newDirectory.chunkId
      }];

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

  public async changeDirectory(directoryChunkId: string): Promise<{success: boolean, message?: string}> {
    if (!this.storageNodeId) {
      return {
        success: false,
        message: 'Node ID not available'
      };
    }

    try {
      // Fetch and decrypt the directory
      const directory = JSON.parse(await this.fetchAndDecryptChunk(directoryChunkId)) as Directory;
      
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

  public async leaveDirectory (): Promise<{success: boolean, message?: string}> {
    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      return {
        success: false,
        message: 'Current directory is not initialized'
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
      .filter(item => item.type === 'directory')
      .sort((a, b) => a.name.localeCompare(b.name));
    const files = currentDirectory.contents
      .filter(item => item.type === 'file')
      .sort((a, b) => a.name.localeCompare(b.name));

    return [...directories, ...files];
  }

  private async fetchAndDecryptChunk(chunkId: string): Promise<string> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }
    
    try {
      const response: any = await firstValueFrom(
        this.http.get(
          `${this.apiUrl}/chunks/get/${this.storageNodeId}/${chunkId}`,
          { headers: this.apiHeaders, responseType: 'arraybuffer' as 'arraybuffer' }
        )
      );

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

      const decryptedData = await this.cryptoService.decryptData(encryptedArrayBuffer, iv);
      const jsonString = new TextDecoder().decode(decryptedData);
            
      return jsonString;
    } catch (error) {
      const errAny = error as any;
      if (errAny && errAny.error instanceof ArrayBuffer) {
        let errorString = '';
        try {
          errorString = new TextDecoder().decode(errAny.error);
        } catch (e) {
          errorString = '';
        }
        // Try to parse as JSON
        let jsonError: any = null;
        try {
          jsonError = JSON.parse(errorString);
        } catch (e) {
            // Not JSON, fallback to string
        }
        if (jsonError && typeof jsonError === 'object' && jsonError.error) {
          const err: any = new Error(jsonError.error);
          if (errAny.status) err.status = errAny.status;
          throw err;
        } else {
          const err: any = new Error(errorString || 'Unknown error');
          if (errAny.status) err.status = errAny.status;
          throw err;
        }
      }
      throw error;
    }
  }

  private async encryptAndStoreChunk(data: string, chunkId: string, iv?: Uint8Array): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    // Encrypt the chunk data
    const dataBuffer = new TextEncoder().encode(data);
    const { encryptedData, iv: encryptionIv } = await this.cryptoService.encryptData(dataBuffer, iv);
    
    // Prepend IV to encrypted data
    const finalData = new ArrayBuffer(encryptionIv.length + encryptedData.byteLength);
    const finalView = new Uint8Array(finalData);
    finalView.set(encryptionIv);
    finalView.set(new Uint8Array(encryptedData), encryptionIv.length);

    try {
      await firstValueFrom(
        this.http.post(
          `${this.apiUrl}/chunks/store/${this.storageNodeId}/${chunkId}`,
          new Blob([finalData]),
          { headers: this.apiHeaders.set('Content-Type', 'application/octet-stream') }
        )
      );
    } catch (error) {
      throw error;
    }
  }

  private async deleteChunk(chunkId: string): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }
    try {
      await firstValueFrom(
        this.http.delete(
          `${this.apiUrl}/chunks/delete/${this.storageNodeId}/${chunkId}`,
          { headers: this.apiHeaders }
        )
      );
    } catch (error) {
      throw error;
    }
  }

  public async deleteFile(fileChunkId: string): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }
    
    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    // Find the file to delete
    const fileToDelete = currentDirectory.contents.find(item => item.type === 'file' && item.chunkId === fileChunkId)  as File | undefined;
    if (!fileToDelete) {
      throw new Error('File not found in current directory');
    }

    try {
      // Delete all data chunks that make up this file
      for (const dataChunkId of fileToDelete.fileChunks) {
        await this.deleteChunk(dataChunkId);
      }

      // Remove the file from the directory
      currentDirectory.contents = currentDirectory.contents.filter(item => item.chunkId !== fileToDelete.chunkId);

      // Update the directory metadata
      await this.updateDirectory();
      
    } catch (error) {
      console.error(`Error deleting file ${fileToDelete.name}:`, error);
      throw error;
    }
  }

  // // Check storage capacity of a storage node
  // async checkStorageCapacity(): Promise<{
  //   used_space_bytes: number;
  //   max_space_bytes: number;
  //   available_space_bytes: number;
  //   current_chunk_count: number;
  // }> {
  //   if (!this.storageNodeId) {
  //     throw new Error('Node ID not available');
  //   }

  //   const response = await this.http.get(
  //     `${this.apiUrl}/node/check-status/${this.storageNodeId}`,
  //     { headers: this.apiHeaders }
  //   ).toPromise() as any;

  //   if (!response || !response.success) {
  //     throw new Error('Failed to get storage status');
  //   }

  //   const storageStatus = {
  //     used_space_bytes: response.used_space_bytes,
  //     max_space_bytes: response.max_space_bytes,
  //     available_space_bytes: response.available_space_bytes,
  //     current_chunk_count: response.current_chunk_count
  //   };

  //   return storageStatus;
  // }

  // // Estimate the size of directory metadata after adding a new directory
  // async estimateDirectoryMetadataSize(newDirectoryName: string): Promise<number> {
  //   const currentDirectory = this.directory.getValue();
  //   if (!currentDirectory) {
  //     throw new Error('Current directory is not initialized');
  //   }

  //   // Create a mock directory structure with the new directory added
  //   const mockDirectory= {
  //     ...currentDirectory,
  //     contents: [
  //       ...currentDirectory.contents,
  //       {
  //         type: 'directory',
  //         name: newDirectoryName,
  //         chunkId: 'temp-mock-dir-id-00000000-mock-uuid' // 36 characters like real UUID
  //       }
  //     ]
  //   };
    
  //   // Calculate the size difference
  //   const currentJsonString = JSON.stringify(currentDirectory);
  //   const mockJsonString = JSON.stringify(mockDirectory);
    
  //   const currentSize = new TextEncoder().encode(currentJsonString).length;
  //   const mockSize = new TextEncoder().encode(mockJsonString).length;
    
  //   // Calculate the difference + encryption overhead for the additional data
  //   const sizeDifference = mockSize - currentSize;
  //   const estimatedSize = sizeDifference + 128;
    
  //   return Math.max(estimatedSize, 200); // Minimum 200 bytes for any directory creation
  // }

  // // Estimate the size of directory metadata after adding a new file
  // async estimateFileMetadataSize(fileName: string, fileSize: number): Promise<number> {
  //   const currentDirectory = this.directory.getValue();
  //   if (!currentDirectory) {
  //     throw new Error('Current directory is not initialized');
  //   }

  //   // Create a mock file
  //   const mockFile: DirectoryItem = {
  //     type: 'file',
  //     name: fileName,
  //     size: fileSize,
  //     createdAt: new Date().toISOString(),
  //     chunkId: 'temp-mock-file-id-00000000-mock-uuid'
  //   };

  //   // Create a mock directory structure with the new file added
  //   const mockDirectory = {
  //     ...currentDirectory,
  //     contents: [...currentDirectory.contents, mockFile]
  //   };

  //   // Calculate the size difference more accurately
  //   const currentJsonString = JSON.stringify(currentDirectory);
  //   const mockJsonString = JSON.stringify(mockDirectory);
    
  //   const currentSize = new TextEncoder().encode(currentJsonString).length;
  //   const mockSize = new TextEncoder().encode(mockJsonString).length;
    
  //   // Calculate the difference + encryption overhead for the additional data
  //   const sizeDifference = mockSize - currentSize;
  //   const estimatedSize = sizeDifference + 128;

  //   return Math.max(estimatedSize, 300); // Minimum 300 bytes for any file addition
  // }
}