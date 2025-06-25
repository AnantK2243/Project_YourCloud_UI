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
  private readonly CHUNK_SIZE = 64 * 1024 * 1024; // 64MB chunks
  private readonly CONCURRENCY_LIMIT = 2;

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

  private async generateUniqueChunkId(maxRetries: number = 10): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const chunkId = this.cryptoService.generateUUID();
      
      try {
        // Check if chunk already exists
        const response = await this.http.get(
          `${this.apiUrl}/chunks/chunk-avail/${this.storageNodeId}/${chunkId}`,
          { headers: this.apiHeaders }
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
    this.storageNodeId = nodeId;
    const rootChunkId = await this.cryptoService.getRootChunk(password);

    // Initialize WebRTC connection
    await this.initWebRTCConnection(nodeId).catch(err => console.error("WebRTC Init failed:", err));

    // Initialize to the root directory on page load
    /*
    try {
      this.storageNodeId = nodeId;
    
      // Check if root directory is initialized
      const wasInitialized = await this.checkRootInitialized(nodeId);

      if (wasInitialized) {
        // Create empty root directory
        const newDirectory = await this.createDirectory("", "", rootChunkId);

        // Update the UI
        this.directory.next(newDirectory);
      } else{
        // Switch to root directory
        await this.changeDirectory(rootChunkId);      
      }
    } catch (error) {
      throw error;
    } 
    */

    console.log("init success");

    // Quick test: upload and download a random chunk
    // try {
    //   const testChunkId = this.cryptoService.generateUUID();
    //   const testData = 'quick test data ' + Math.random();
    //   await this.encryptAndUploadChunk(testData, testChunkId);
    //   const downloaded = await this.downloadAndDecryptChunk(testChunkId);
    //   if (downloaded === testData) {
    //     console.log('Quick test upload/download succeeded:', testChunkId);
    //   } else {
    //     console.error('Quick test failed: downloaded data does not match uploaded data', { uploaded: testData, downloaded });
    //   }
    // } catch (err) {
    //   console.error('Quick test upload/download failed:', err);
    // }

    return rootChunkId;
  }
  
  async checkRootInitialized(nodeId: string): Promise<boolean> {
    try {
      const response = await this.http.get(
        `${this.apiUrl}/node/initialize-root/${nodeId}`,
        { headers: this.apiHeaders }
      ).toPromise() as { success: boolean, wasInitialized: boolean };

      return response.wasInitialized;
    } catch (error) {
      console.error('Error checking root directory initialization:', error);
      throw error;
    }
  }

  async createDirectory(name: string, parentId: string, chunkID?: string): Promise<Directory> {
    try {
      const directoryChunkId = chunkID ?  chunkID : await this.generateUniqueChunkId();

      const newDirectory: Directory = { 
        chunkId: directoryChunkId, 
        name, 
        parentId: parentId, 
        contents: []
      };

      // Add to storage
      await this.storeDirectory(newDirectory);

      return newDirectory;
    } catch (error) {
      console.error('Error creating directory:', error);
      throw error;
    }
  }

  async createSubdirectory(name: string): Promise<void> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    // Check if directory name already exists
    const existingDir = currentDirectory.contents.find(d => d.name === name);
    if (existingDir) {
      throw new Error(`Directory "${name}" already exists`);
    }

    try {
      // Create the new directory
      const newDirectory = await this.createDirectory(name, currentDirectory.chunkId);

      // Add the new directory to the current directory
      currentDirectory.contents.push({
        type: 'directory',
        name: newDirectory.name,
        chunkId: newDirectory.chunkId
      });

      // Update the directory metadata
      await this.updateDirectory();

    } catch (error) {
      console.error('Error creating subdirectory:', error);
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
        { headers: this.apiHeaders }
      ).toPromise();
    } catch (error) {
      console.error(`Error deleting chunk ${chunkId}:`, error);
      throw error;
    }
  }

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
        { headers: this.apiHeaders }
      ).toPromise();
    } catch (error: any) {
      console.error(`Error uploading chunk:`, error);
      throw error;
    }
  }

  private async fetchDirectory(directoryChunkId: string): Promise<Directory> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    try {      
      // Try to fetch directory metadata
      const response = await this.http.get(
        `${this.apiUrl}/chunks/get/${this.storageNodeId}/${directoryChunkId}`,
        { 
          headers: this.apiHeaders,
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
      
      return directoryData;
    } catch (error: any) {
      console.error('Error fetching directory metadata:', error);
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
      contents: [...currentDirectory.contents] // Ensure a new reference for change detection
    };
    this.directory.next(updatedDirectory);
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
    const directoryToDelete = currentDirectory.contents.find(item => item.type === 'directory' && item.chunkId === directoryChunkId) as DirectoryItem | undefined;

    if (!directoryToDelete) {
      throw new Error('Directory not found in current directory');
    }

    try {
      // First, fetch the directory to check if it's empty
      const targetDirectory = await this.fetchDirectory(directoryChunkId);
      
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
      throw error;
    }
  }

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
  async getDirectoryContents(): Promise<DirectoryItem[]> {
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

  // Check storage capacity of a storage node
  async checkStorageCapacity(): Promise<{
    used_space_bytes: number;
    max_space_bytes: number;
    available_space_bytes: number;
    current_chunk_count: number;
  }> {
    if (!this.storageNodeId) {
      throw new Error('Node ID not available');
    }

    const response = await this.http.get(
      `${this.apiUrl}/node/check-status/${this.storageNodeId}`,
      { headers: this.apiHeaders }
    ).toPromise() as any;

    if (!response || !response.success) {
      throw new Error('Failed to get storage status');
    }

    const storageStatus = {
      used_space_bytes: response.used_space_bytes,
      max_space_bytes: response.max_space_bytes,
      available_space_bytes: response.available_space_bytes,
      current_chunk_count: response.current_chunk_count
    };

    return storageStatus;
  }

  // Estimate the size of directory metadata after adding a new directory
  async estimateDirectoryMetadataSize(newDirectoryName: string): Promise<number> {
    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    // Create a mock directory structure with the new directory added
    const mockDirectory= {
      ...currentDirectory,
      contents: [
        ...currentDirectory.contents,
        {
          type: 'directory',
          name: newDirectoryName,
          chunkId: 'temp-mock-dir-id-00000000-mock-uuid' // 36 characters like real UUID
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
  async estimateFileMetadataSize(fileName: string, fileSize: number): Promise<number> {
    const currentDirectory = this.directory.getValue();
    if (!currentDirectory) {
      throw new Error('Current directory is not initialized');
    }

    // Create a mock file
    const mockFile: DirectoryItem = {
      type: 'file',
      name: fileName,
      size: fileSize,
      createdAt: new Date().toISOString(),
      chunkId: 'temp-mock-file-id-00000000-mock-uuid'
    };

    // Create a mock directory structure with the new file added
    const mockDirectory = {
      ...currentDirectory,
      contents: [...currentDirectory.contents, mockFile]
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

  async initWebRTCConnection(nodeId: string): Promise<void> {
    if (this.webrtcReady && this.peerConnection?.connectionState === 'connected') {
        return;
    }

    this.webrtcReady = false;

    // Fetch TURN credentials from backend
    let iceServers: RTCIceServer[] = [];
    try {
        const turnConfig = await this.http.post<any>(
            `${this.apiUrl}/turn-credentials`,
            {},
            { headers: this.apiHeaders }
        ).toPromise();

        if (turnConfig && turnConfig.iceServers) {
            iceServers = turnConfig.iceServers;
        } else {
            throw new Error('Failed to retrieve valid TURN server configuration.');
        }
    } catch (error) {
        console.error("Could not fetch TURN credentials, proceeding with STUN only.", error);
        iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    }
    
    // Use the dynamically fetched credentials to create the peer connection.
    this.peerConnection = new RTCPeerConnection({ iceServers });

    this.dataChannel = this.peerConnection.createDataChannel('yourcloud-file-transfer');
    
    const iceCandidateQueue: RTCIceCandidate[] = [];
    let commandId: string | null = null;

    this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && commandId) {
            this.http.post(
                `${this.apiUrl}/signal/ice-candidate/${nodeId}`,
                { 
                    candidate: event.candidate,
                    command_id: commandId
                },
                { headers: this.apiHeaders }
            ).subscribe();
        } else if (event.candidate) {
            iceCandidateQueue.push(event.candidate);
        }
    };
    
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    const answerResponse = await this.http.post(
      `${this.apiUrl}/signal/offer/${nodeId}`,
      { offer },
      { headers: this.apiHeaders }
    ).toPromise() as { success: boolean, answer: RTCSessionDescriptionInit, command_id: string };

    if (!answerResponse || !answerResponse.answer || !answerResponse.command_id) {
        throw new Error('Invalid answer payload received from backend');
    }

    commandId = answerResponse.command_id;
    while(iceCandidateQueue.length > 0) {
        const candidate = iceCandidateQueue.shift();
        if (candidate) {
            this.http.post(
                `${this.apiUrl}/signal/ice-candidate/${nodeId}`,
                { 
                    candidate: candidate,
                    command_id: commandId
                },
                { headers: this.apiHeaders }
            ).subscribe();
        }
    }
    
    await this.peerConnection.setRemoteDescription(answerResponse.answer);

    return new Promise((resolve, reject) => {
        if(!this.dataChannel) return reject("Data channel does not exist");
        
        const timeout = setTimeout(() => {
            reject(new Error("Data channel connection timed out."));
        }, 30000);

        this.dataChannel.onopen = () => {
            clearTimeout(timeout);
            this.webrtcReady = true;
            resolve();
        };

        this.dataChannel.onerror = (error) => {
            clearTimeout(timeout);
            console.error("Data Channel Error:", error);
            this.webrtcReady = false;
            reject(error);
        };
    });
  } 

  async encryptAndUploadChunk(data: string, chunkId: string, iv?: Uint8Array): Promise<void> {
    if (!this.dataChannel || !this.webrtcReady) {
        throw new Error('WebRTC Data Channel is not ready.');
    }

    // Encrypt the chunk data
    const dataBuffer = new TextEncoder().encode(data);
    const { encryptedData, iv: encryptionIv } = await this.cryptoService.encryptData(dataBuffer, iv);
    
    // Prepend IV to encrypted data
    const finalData = new ArrayBuffer(encryptionIv.length + encryptedData.byteLength);
    const finalView = new Uint8Array(finalData);
    finalView.set(encryptionIv);
    finalView.set(new Uint8Array(encryptedData), encryptionIv.length);

    // Define the header
    const header = {
        type: 'UPLOAD',
        chunkId: chunkId
    };
    const headerJson = JSON.stringify(header);

    // Send the header first
    this.dataChannel.send(headerJson);
    
    // Send the binary packet
    const PACKET_SIZE = 16 * 1024; // 16KB 
    let offset = 0;
    while(offset < finalData.byteLength) {
        const end = Math.min(offset + PACKET_SIZE, finalData.byteLength);
        const piece = finalData.slice(offset, end);

        // Wait if the buffer is full
        await this.waitForDataChannelBuffer();
        
        this.dataChannel.send(piece);
        offset = end;
    }

    // Notify completion
    const completionMessage = { type: 'TRANSFER_COMPLETE', chunkId: chunkId };
    this.dataChannel.send(JSON.stringify(completionMessage));
  }

  async downloadAndDecryptChunk(chunkId: string): Promise<string> {
    if (!this.dataChannel || !this.webrtcReady) {
      throw new Error('WebRTC Data Channel is not ready.');
    }
    
    return new Promise((resolve, reject) => {
      const receivedPieces: ArrayBuffer[] = [];
      let totalSize = 0;
      
      // Cleanup function to remove handlers and timeout
      const cleanup = () => {
        if (this.dataChannel) {
          this.dataChannel.onmessage = null; 
          this.dataChannel.onerror = null;
        }
        clearTimeout(timeoutId);
      };

      // Set up the message handler specifically for this download
      const messageHandler = async (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          // This is a control message from the Rust node
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'TRANSFER_COMPLETE' && msg.chunkId === chunkId) {
              // Transfer complete, proceed to reassemble and decrypt
              cleanup();
              
              // Reassemble all the binary pieces received
              const encryptedPayload = new Uint8Array(totalSize);
              let offset = 0;
              for (const piece of receivedPieces) {
                encryptedPayload.set(new Uint8Array(piece), offset);
                offset += piece.byteLength;
              }

              // Check if the reassembled data is valid
              if (encryptedPayload.length < 12) {
                return reject(new Error('Downloaded data is too short to be valid.'));
              }
              
              // Extract the IV and encrypted content
              const iv = encryptedPayload.slice(0, 12);
              const encryptedContent = encryptedPayload.slice(12).buffer;

              // Decrypt and resolve the promise
              try {
                const decryptedString = new TextDecoder().decode(
                  await this.cryptoService.decryptData(encryptedContent, iv)
                );
                resolve(decryptedString);
              } catch (err) {
                reject(new Error(`Failed to decrypt chunk ${chunkId}: ${err}`));
              }

            } else if (msg.type === 'TRANSFER_ERROR' && msg.chunkId === chunkId) {
              cleanup();
              reject(new Error(msg.error || `Storage node failed to send chunk ${chunkId}`));
            }
          } catch (e) { /* Ignore non-JSON or irrelevant string messages */ }
        } else if (event.data instanceof ArrayBuffer) {
          // This is a binary piece of the chunk we requested
          receivedPieces.push(event.data);
          totalSize += event.data.byteLength;
        }
      };

      const errorHandler = (event: Event) => {
        cleanup();
        reject(new Error(`Data channel error during download: ${event}`));
      };

      // Set a timeout for the entire operation to prevent it from hanging indefinitely
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout: No response from storage node for chunk ${chunkId}.`));
      }, 30000); // 30-second timeout

      // Assign the temporary handlers
      if (this.dataChannel) {
        this.dataChannel.onmessage = messageHandler;
        this.dataChannel.onerror = errorHandler;

        // Send the request to the Rust node
        const requestHeader = {
          type: 'DOWNLOAD',
          chunkId: chunkId
        };
        this.dataChannel.send(JSON.stringify(requestHeader));
      } else {
        cleanup();
        reject(new Error('WebRTC Data Channel is not available.'));
      }
    });
  }

  // Helper function to manage buffer
  private waitForDataChannelBuffer(): Promise<void> {
    const HIGH_WATER_MARK = 16 * 1024 * 1024; // 16MB buffer limit
    if (!this.dataChannel || this.dataChannel.bufferedAmount < HIGH_WATER_MARK) {
        return Promise.resolve();
    }
    return new Promise(resolve => {
        if(!this.dataChannel) return resolve(); // Should not happen if called correctly
        this.dataChannel.onbufferedamountlow = () => {
            // Remove the listener once it has fired
            if (this.dataChannel) this.dataChannel.onbufferedamountlow = null;
            resolve();
        };
    });
  }
}