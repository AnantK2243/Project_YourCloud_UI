import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { CryptoService } from './crypto.service';

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
  files: File[];
  directories: Directory[]
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
  private apiUrl = this.getApiUrl();
  private readonly CHUNK_SIZE = 256 * 1024 * 1024; // 256MB chunks
  private readonly CONCURRENCY_LIMIT = 2;
  private directory = new BehaviorSubject<Directory | null>(null);
  private storageNodeId: string | null = null;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private cryptoService: CryptoService
  ) {}

  private getApiUrl(): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api`;
    }
    return 'https://localhost:4200/api';
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  // Get current directory observable for components to subscribe to
  getDirectoryObservable(): Observable<Directory | null> {
    return this.directory.asObservable();
  }

  // Get current directory value
  getCurrentDirectory(): Directory | null {
    return this.directory.getValue();
  }

  // Generate a unique chunk ID with retry logic to avoid duplicates
  private async generateUniqueChunkId(maxRetries: number = 10): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const chunkId = this.cryptoService.generateUUID();
      
      try {
        // Check if chunk already exists
        const response = await this.http.get(
          `${this.apiUrl}/chunks/chunk-avail/${this.storageNodeId}/${chunkId}`,
          { headers: this.getHeaders() }
        ).toPromise() as { success: boolean, chunk_id: string, available: boolean };

        if (response.success && response.available) {
          return chunkId; // Chunk doesn't exist
        }
      } catch (error: any) {
        console.error('Error checking chunk existence:', error);
        throw error;
      }
    }
    throw new Error(`Failed to generate unique chunk ID after ${maxRetries} attempts`);
  }

  async initializePage(password: string, nodeId: string): Promise<string> {
    // Initialize to the root directory on page load
    try {
      this.storageNodeId = nodeId;
      const directoryChunkId = await this.cryptoService.getRootChunk(password);
    
      // Check if root directory is initialized
      const wasInitialized = await this.checkRootInitialized(nodeId);

      if (wasInitialized) {
        // Create empty root directory
        const newDirectory = await this.createDirectory("", "", directoryChunkId);
        this.directory.next(newDirectory);

        // Update the UI
        this.directory.next(newDirectory);
      } else{
        // Load the root directory
        this.directory.next(await this.fetchDirectory(directoryChunkId));
      }

      return directoryChunkId;

    } catch (error) {
      console.error('Error initializing root directory for first time:', error);
      throw error;
    }
  }
  
  async checkRootInitialized(nodeId: string): Promise<boolean> {
    try {
      const response = await this.http.get(
        `${this.apiUrl}/node/${nodeId}/initialize-root`,
        { headers: this.getHeaders() }
      ).toPromise() as { success: boolean, wasInitialized: boolean };

      return response.wasInitialized;
    } catch (error) {
      console.error('Error checking root directory initialization:', error);
      return false;
    }
  }

  // Create an encrypted empty directory and return its metadata
  async createDirectory(name: string, parentId: string, chunkID?: string): Promise<Directory> {
    try {
      const directoryChunkId = chunkID ?  chunkID : await this.generateUniqueChunkId();

      const newDirectory: Directory = { 
        chunkId: directoryChunkId, 
        name, 
        parentId: parentId, 
        files: [], 
        directories: [] 
      };

      // Store the subdirectory
      await this.storeDirectory(newDirectory);

      return newDirectory;
    } catch (error) {
      console.error('Error initializing directory:', error);
      throw error;
    }
  }

  // Create a subdirectory in the current directory
  async createSubdirectory(name: string): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    // Check if directory name already exists
    const existingDir = currentDirectory.directories.find(d => d.name === name);
    if (existingDir) {
      throw new Error(`Directory "${name}" already exists`);
    }

    try {
      // Create the new directory
      const newDirectory = await this.createDirectory(name, currentDirectory.chunkId);

      // Add the new directory to the current directory
      currentDirectory.directories.push(newDirectory);

      // Update the directory metadata
      await this.updateDirectory();

    } catch (error) {
      console.error('Error creating subdirectory:', error);
      throw error;
    }
  }

  // Take directory metadata, encrypt it, and store it
  private async storeDirectory(directory: Directory): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    // Encrypt the directory metadata
    const jsonString = JSON.stringify(directory);
    const dataBuffer = new TextEncoder().encode(jsonString);

    const { encryptedData, iv } = await this.cryptoService.encryptData(dataBuffer);

    // Prepend IV to encrypted data
    const finalData = new ArrayBuffer(iv.length + encryptedData.byteLength);
    const finalView = new Uint8Array(finalData);
    finalView.set(iv);
    finalView.set(new Uint8Array(encryptedData), iv.length);

    try{
      // Store the updated directory metadata
      await this.http.post(
        `${this.apiUrl}/chunks/store/${this.storageNodeId}/${directory.chunkId}`,
        finalData,
        { 
          headers: this.getHeaders().set('Content-Type', 'application/octet-stream')
        }
      ).toPromise();
    } catch (error: any) {
      console.error(`Error uploading chunk:`, error);
      throw error;
    }
  }

  private async updateDirectory(): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    // Delete old directory metadata
    await this.deleteChunk(currentDirectory.chunkId);

    // Store updated directory metadata
    await this.storeDirectory(currentDirectory);

    // Update the local state with a deep copy to trigger observable
    const updatedDirectory: Directory = {
      ...currentDirectory,
      directories: [...currentDirectory.directories],
      files: [...currentDirectory.files]
    };
    this.directory.next(updatedDirectory);
  }

  // Fetch directory metadata, decrypt it, and return it
  private async fetchDirectory(directoryChunkId: string): Promise<Directory> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    try {      
      // Try to fetch directory metadata
      const response = await this.http.get(
        `${this.apiUrl}/chunks/get/${this.storageNodeId}/${directoryChunkId}`,
        { 
          headers: this.getHeaders(),
          responseType: 'arraybuffer'
        }
      ).toPromise();

      if (!response || response.byteLength === 0) {
        throw new Error('No data received when fetching directory metadata');
      }
      
      const responseBuffer = new Uint8Array(response);
      
      if (responseBuffer.length < 12) {
        throw new Error('Invalid directory data: too short');
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
      
      const directoryData = JSON.parse(jsonString) as Directory;
      
      // Ensure required properties exist
      if (!directoryData.directories || !directoryData.files){
        throw new Error('Directory data invalid');
      }
      
      return directoryData;
    } catch (error: any) {
      console.error('Error fetching directory metadata:', error);
      
      if (error.status === 404) {
        throw new Error(`Directory chunk not found: ${directoryChunkId}`);
      } else if (error.status === 403) {
        throw new Error('Access denied to directory');
      } else if (error.status === 503) {
        throw new Error('Storage node is not available');
      } else if (error.message.includes('decrypt')) {
        throw new Error('Failed to decrypt directory data');
      } else if (error.message.includes('JSON')) {
        throw new Error('Directory data is corrupted or invalid');
      } else {
        throw new Error(`Failed to fetch directory: ${error.message || error}`);
      }
    }
  }

  // Navigate into a directory
  async changeDirectory(directoryChunkId: string): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    try {
      // Fetch and decrypt the directory
      const directory = await this.fetchDirectory(directoryChunkId);
      
      // Update the current directory
      this.directory.next(directory);
      
    } catch (error) {
      console.error('Error navigating to directory:', error);
      throw error;
    }
  }

  async leaveDirectory (): Promise<void> {
    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }
    await this.changeDirectory(currentDirectory.parentId);
  }

  // Get list of files and directories in the current directory
  async getDirectoryFiles(): Promise<DirectoryItem[]> {
    const currentDirectory = this.directory.getValue();

    if (!currentDirectory) {
      return [];
    }

    const directoryItems: DirectoryItem[] = currentDirectory.directories.map(dir => ({
      type: 'directory',
      name: dir.name,
      chunkId: dir.chunkId
    }));

    const fileItems: DirectoryItem[] = currentDirectory.files.map(file => ({
      type: 'file',
      name: file.name,
      size: file.size,
      createdAt: file.createdAt,
      chunkId: file.chunkId
    }));

    return [...directoryItems, ...fileItems];
  }

  // Check if there's enough storage space for the given data size
  async checkStorageCapacity(requiredBytes: number, operationName: string = 'operation'): Promise<void> {
    try {
      const storageStatus = await this.checkSpaceAvailability();

      if (requiredBytes > storageStatus.available_space_bytes) {
        const storageError = new Error();
        storageError.name = 'StorageSpaceWarning';
        storageError.message = 'Insufficient storage space';
        (storageError as any).isStorageWarning = true;
        (storageError as any).availableSpace = storageStatus.available_space_bytes;
        (storageError as any).requiredSpace = requiredBytes;
        (storageError as any).operationName = operationName;
        throw storageError;
      }      
    } catch (error) {
      // If it's already a storage warning, re-throw it
      if ((error as any).isStorageWarning) {
        throw error;
      }
      // If storage status check failed, log warning but continue (best effort)
      console.warn(`Could not check storage space before ${operationName}:`, error);
    }
  }

  // Upload a file to the current directory with controlled concurrency
  async uploadFileStream(browserFile: globalThis.File, onProgress?: (progress: number) => void): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    if (!browserFile) {
      throw new Error('No file provided');
    }

    const newFile: File = {
      chunkId: await this.generateUniqueChunkId(),
      name: browserFile.name,
      size: browserFile.size,
      createdAt: new Date().toISOString(),
      iv: '', // Will be set after the first chunk is encrypted
      fileChunks: []
    };

    const stream = browserFile.stream();
    const reader = stream.getReader();
    
    const uploadPromises: Promise<{ index: number, chunkId: string }>[] = [];
    const completedChunks: { index: number, chunkId: string }[] = [];
    let totalBytesRead = 0;
    let chunkIndex = 0;
    let buffer = new Uint8Array(this.CHUNK_SIZE * 2);
    let bufferSize = 0;
    let endOfStream = false;
    let fileIv: Uint8Array | undefined = undefined;

    try {
      while (true) {
        while (bufferSize < this.CHUNK_SIZE && !endOfStream) {
          const { done, value } = await reader.read();
          
          if (done) {
            endOfStream = true;
            break;
          }
          
          if (value) {
            buffer.set(value, bufferSize);
            bufferSize += value.length;
            totalBytesRead += value.length;
          }

          // Update progress
          if (onProgress) {
            const progress = Math.min(100, Number((totalBytesRead / browserFile.size).toPrecision(2)) * 100);
            onProgress(progress);
          }
        }

        // If no data in buffer and stream ended, we're done
        if (bufferSize === 0 && endOfStream) {
          break;
        }
        
        const chunkSize = Math.min(this.CHUNK_SIZE, bufferSize);
        const chunkData = buffer.slice(0, chunkSize).buffer;

        // Remove next chunk from buffer
        if (bufferSize > chunkSize) {
          buffer.copyWithin(0, chunkSize);
          bufferSize -= chunkSize;
        } else {
          bufferSize = 0;
        }

        const currentChunkIndex = chunkIndex;
        const uploadTask = async (): Promise<{ index: number, chunkId: string }> => {
          try {
            const chunkId = await this.generateUniqueChunkId();

            const { encryptedData, iv } = await this.cryptoService.encryptData(chunkData, fileIv);

            if (currentChunkIndex === 0) {
              fileIv = iv;
              newFile.iv = Array.from(fileIv).map(b => b.toString(16).padStart(2, '0')).join('');
            }
            
            await this.http.post(
              `${this.apiUrl}/chunks/store/${this.storageNodeId}/${chunkId}`,
              encryptedData,
              { headers: this.getHeaders().set('Content-Type', 'application/octet-stream') }
            ).toPromise();

            return { index: currentChunkIndex, chunkId };
          } catch (error: any) {
            console.error(`Error uploading chunk ${currentChunkIndex}:`, error);
            throw error;
          }
        };

        const promise = uploadTask();
        uploadPromises.push(promise);

        if (uploadPromises.length >= this.CONCURRENCY_LIMIT) {
          const resolvedChunk = await uploadPromises.shift();
          if (resolvedChunk) {
            completedChunks.push(resolvedChunk);
          }
        }

        chunkIndex++;
      }

      // Collect and order all chunks
      const remainingChunkResults = await Promise.all(uploadPromises);
      const allChunkResults: { index: number, chunkId: string }[] = [...completedChunks, ...remainingChunkResults];
      allChunkResults.sort((a, b) => a.index - b.index);
      newFile.fileChunks = allChunkResults.map(result => result.chunkId);
    
      // Add file to directory
      currentDirectory.files.push(newFile);
      
      // Update directory metadata
      await this.updateDirectory();

    } catch (error) {
      console.error('Error during concurrent file upload:', error);
      await reader.cancel();
      throw error;
    } finally {
      try {
        reader.releaseLock();
      } catch (e) {
        console.warn('Could not release reader lock:', e);
      }
    }
  }

  async downloadFileStream(fileChunkId: string, onProgress?: (progress: number) => void): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    // Find the file to download
    const file = currentDirectory.files.find(f => f.chunkId === fileChunkId);
    if (!file) {
      throw new Error('File not found in current directory');
    }

    try {
      const downloadedChunks: ArrayBuffer[] = [];
      let totalBytesDownloaded = 0;

      // Download all data chunks that make up this file
      for (let i = 0; i < file.fileChunks.length; i++) {
        const dataChunkId = file.fileChunks[i];
        
        try {
          // Download the encrypted chunk
          const response = await this.http.get(
            `${this.apiUrl}/chunks/get/${this.storageNodeId}/${dataChunkId}`,
            { 
              headers: this.getHeaders(),
              responseType: 'arraybuffer'
            }
          ).toPromise();

          if (!response || response.byteLength === 0) {
            throw new Error(`No data received for chunk ${i + 1}`);
          }

          // Decrypt the chunk
          const responseBuffer = new Uint8Array(response);
          const iv = new Uint8Array(file.iv.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
          const decryptedChunk = await this.cryptoService.decryptData(response, iv);
          
          downloadedChunks.push(decryptedChunk);
          totalBytesDownloaded += decryptedChunk.byteLength;

          // Update progress
          if (onProgress) {
            const progress = Math.min(100, ((i + 1) / file.fileChunks.length) * 100);
            onProgress(progress);
          }

        } catch (error) {
          console.error(`Error downloading chunk ${i + 1}:`, error);
          throw new Error(`Failed to download chunk ${i + 1}: ${error}`);
        }
      }

      // Combine all chunks into a single file
      const totalSize = downloadedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const combinedData = new Uint8Array(totalSize);
      let offset = 0;

      for (const chunk of downloadedChunks) {
        combinedData.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }

      // Create blob and trigger download
      const blob = new Blob([combinedData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      // Create temporary download link
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = file.name;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      
      // Cleanup
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error(`Error downloading file ${file.name}:`, error);
      throw error;
    }
  }

  public async deleteChunk(chunkId: string): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }
    try {
      await this.http.delete(
        `${this.apiUrl}/chunks/delete/${this.storageNodeId}/${chunkId}`,
        { headers: this.getHeaders() }
      ).toPromise();
    } catch (error) {
      console.error(`Error deleting chunk ${chunkId}:`, error);
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
    const fileIndex = currentDirectory.files.findIndex(file => file.chunkId === fileChunkId);
    if (fileIndex === -1) {
      throw new Error('File not found in current directory');
    }

    const fileToDelete = currentDirectory.files[fileIndex];
    
    try {
      // Delete all data chunks that make up this file
      for (const dataChunkId of fileToDelete.fileChunks) {
        await this.deleteChunk(dataChunkId);
      }

      // Remove the file from the directory
      currentDirectory.files.splice(fileIndex, 1);
      
      // Update the directory metadata
      await this.updateDirectory();
      
    } catch (error) {
      console.error(`Error deleting file ${fileToDelete.name}:`, error);
      throw error;
    }
  }

  public async deleteDirectory(directoryChunkId: string): Promise<{success: boolean, message?: string}> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }
    
    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    // Find the directory to delete
    const directoryIndex = currentDirectory.directories.findIndex(dir => dir.chunkId === directoryChunkId);
    if (directoryIndex === -1) {
      throw new Error('Directory not found in current directory');
    }

    const directoryToDelete = currentDirectory.directories[directoryIndex];
    
    try {
      // First, fetch the directory to check if it's empty
      const targetDirectory = await this.fetchDirectory(directoryChunkId);
      
      // Check if directory is empty
      if (targetDirectory.files.length > 0 || targetDirectory.directories.length > 0) {
        return {
          success: false,
          message: `Cannot delete "${directoryToDelete.name}": Directory is not empty. Please delete all files and subdirectories first.`
        };
      }
      
      // Delete the directory chunk from storage
      await this.deleteChunk(directoryChunkId);
      
      // Remove the directory from the parent directory
      currentDirectory.directories.splice(directoryIndex, 1);
      
      // Update the parent directory metadata
      await this.updateDirectory();
      
      return { success: true };
      
    } catch (error) {
      console.error(`Error deleting directory ${directoryToDelete.name}:`, error);
      throw error;
    }
  }

  // Check storage space availability
  private async checkSpaceAvailability(): Promise<{
    used_space_bytes: number;
    max_space_bytes: number;
    available_space_bytes: number;
    current_chunk_count: number;
  }> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    const response = await this.http.get(
      `${this.apiUrl}/check-status/${this.storageNodeId}`,
      { headers: this.getHeaders() }
    ).toPromise() as any;

    if (!response || !response.success) {
      throw new Error('Failed to get storage status');
    }

    return {
      used_space_bytes: response.used_space_bytes,
      max_space_bytes: response.max_space_bytes,
      available_space_bytes: response.available_space_bytes,
      current_chunk_count: response.current_chunk_count
    };
  }

  // Estimate the size of directory metadata after adding a new subdirectory
  async estimateDirectoryMetadataSize(newDirectoryName: string): Promise<number> {
    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    // Create a mock directory structure with the new subdirectory added
    const mockDirectory = {
      ...currentDirectory,
      directories: [
        ...currentDirectory.directories,
        {
          chunkId: 'temp-mock-dir-id-00000000-mock-uuid', // 36 characters like real UUID
          name: newDirectoryName,
          parentId: currentDirectory.chunkId,
          files: [],
          directories: []
        }
      ]
    };
    
    // Calculate the size difference
    const currentJsonString = JSON.stringify(currentDirectory);
    const mockJsonString = JSON.stringify(mockDirectory);
    
    const currentSize = new TextEncoder().encode(currentJsonString).length;
    const mockSize = new TextEncoder().encode(mockJsonString).length;
    
    // Calculate the difference + encryption overhead for the additional data
    const sizeDifference = mockSize - currentSize;
    const estimatedSize = sizeDifference + 128;
    
    return Math.max(estimatedSize, 200); // Minimum 200 bytes for any directory creation
  }

  // Estimate the size of directory metadata after adding a new file
  async estimateDirectoryMetadataSizeForFile(fileName: string, fileSize: number): Promise<number> {
    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    // Calculate the number of chunks needed for this file size
    const numChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
    // Generate mock chunk IDs that are the same length as real UUIDs (36 characters)
    const mockChunks = Array.from({ length: numChunks }, (_, i) => `temp-chunk-id-${i.toString().padStart(8, '0')}-mock-uuid`);

    // Create a mock file entry
    const mockFile: File = {
      chunkId: 'temp-mock-file-id-00000000-mock-uuid', // 36 characters like real UUID
      name: fileName,
      size: fileSize,
      createdAt: new Date().toISOString(),
      iv: 'temp-mock-iv-24-char-hex', // 24 characters like real IV hex string (12 bytes * 2)
      fileChunks: mockChunks
    };

    // Create a mock directory structure with the new file added
    const mockDirectory = {
      ...currentDirectory,
      files: [...currentDirectory.files, mockFile]
    };

    // Calculate the size difference more accurately
    const currentJsonString = JSON.stringify(currentDirectory);
    const mockJsonString = JSON.stringify(mockDirectory);
    
    const currentSize = new TextEncoder().encode(currentJsonString).length;
    const mockSize = new TextEncoder().encode(mockJsonString).length;
    
    // Calculate the difference + encryption overhead for the additional data
    const sizeDifference = mockSize - currentSize;
    const estimatedSize = sizeDifference + 128;

    return Math.max(estimatedSize, 300); // Minimum 300 bytes for any file addition
  }
}
