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

  async initializePage(password: string, nodeId: string): Promise<string> {
    // Initialize to the root directory on page load
    try {
      this.storageNodeId = nodeId;
      const directoryChunkId = await this.cryptoService.getRootChunk(password);
    
      // Check if root directory is initialized
      const wasInitialized = await this.checkRootInitialized(nodeId);

      if (wasInitialized) {
        // Create empty root directory
        const newDirectory = await this.createDirectory("", directoryChunkId);
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
  async createDirectory(name: string, chunkID?: string): Promise<Directory> {
    try {
      const directoryChunkId = chunkID || this.cryptoService.generateUUID();
      const newDirectory: Directory = { chunkId: directoryChunkId, name, files: [], directories: [] };

      await this.storeDirectory(newDirectory);

      return newDirectory;
    } catch (error) {
      console.error('Error initializing directory:', error);
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
      console.error('Error storing directory metadata:', error);
      throw error;
    }
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

      // Update the UI
      this.directory.next(directoryData);
      
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
      
      // Update the local state
      this.directory.next(currentDirectory);
      
    } catch (error) {
      console.error(`Error deleting file ${fileToDelete.name}:`, error);
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
      chunkId: this.cryptoService.generateUUID(),
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
            const chunkId = this.cryptoService.generateUUID();

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
          } catch (error) {
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
      
      // Update the local state
      this.directory.next(currentDirectory);

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
}
