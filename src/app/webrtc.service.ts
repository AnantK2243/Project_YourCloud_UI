import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject } from 'rxjs';

export interface ICEServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

export interface TurnCredentialsResponse {
  success: boolean;
  iceServers: ICEServerConfig[];
  error?: string;
}

export interface P2PSession {
  sessionId: string;
  nodeId: string;
  status: 'connecting' | 'connected' | 'failed';
  dataChannel?: RTCDataChannel;
  dataChannelReady?: boolean;
  pendingResponses?: Map<string, { resolve: Function, reject: Function, timeout: ReturnType<typeof setTimeout> }>;
}

@Injectable({
  providedIn: 'root'
})
export class WebRTCService {
  private readonly API_BASE = this.getApiUrl();
  private readonly WS_URL = this.getWebSocketUrl();
  private readonly WEBRTC_MESSAGE_SIZE = 64 * 1024; // 64KB

  private websocket: WebSocket | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private activeSessions = new Map<string, P2PSession>();
  private iceServers: ICEServerConfig[] = [];
  
  private sessionStatusSubject = new Subject<P2PSession>();
  private errorSubject = new Subject<string>();
  
  public sessionStatus$ = this.sessionStatusSubject.asObservable();
  public error$ = this.errorSubject.asObservable();
  
  constructor(private http: HttpClient) {}

  private getApiUrl(): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api`;
    }
    return 'https://localhost:4200/api';
  }

  private getWebSocketUrl(): string {
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}`;
    }
    return 'wss://localhost:4200';
  }

  /**
   * Initialize WebRTC service
   */
  async initialize(): Promise<void> {
    await this.getTurnCredentials();
    await this.setupWebSocket();
  }

  /**
   * Start upload session with storage node
   */
  async startUploadSession(nodeId: string, fileMetadata: any): Promise<string> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      await this.setupWebSocket();
    }

    const token = localStorage.getItem('token');
    if (!token) throw new Error('No authentication token found');

    const sessionId = await this.initiateP2PSession(nodeId, fileMetadata, token);
    await this.createPeerConnection(sessionId);
    return sessionId;
  }

  /**
   * Send encrypted chunk data
   */
  async sendChunk(sessionId: string, chunkId: string, encryptedData: ArrayBuffer): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.dataChannel || session.dataChannel.readyState !== 'open' || !session.dataChannelReady) {
      throw new Error('Session or data channel not available');
    }

    const safeMessageSize = this.WEBRTC_MESSAGE_SIZE;
    
    // Send chunk metadata first
    const metadata = { 
      chunk_id: chunkId, 
      size: encryptedData.byteLength,
      total_parts: Math.ceil(encryptedData.byteLength / safeMessageSize)
    };
    session.dataChannel.send(JSON.stringify(metadata));

    // Break large chunks into smaller WebRTC messages
    const totalParts = Math.ceil(encryptedData.byteLength / safeMessageSize);
        
    for (let partIndex = 0; partIndex < totalParts; partIndex++) {
      const start = partIndex * safeMessageSize;
      const end = Math.min(start + safeMessageSize, encryptedData.byteLength);
      const part = encryptedData.slice(start, end);
            
      // Add a delay between parts to avoid overwhelming the data channel
      if (partIndex > 0) {
        const delay = (partIndex % 50 === 0) ? 100 : 25; // 100ms every 50 parts, 25ms otherwise
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Check if data channel is still open before sending each part
      if (session.dataChannel.readyState !== 'open') {
        console.error(`Data channel closed during transmission at part ${partIndex + 1}/${totalParts}`);
        throw new Error(`Data channel closed during transmission`);
      }
      
      try {
        session.dataChannel.send(part);
        
        // Log progress every 100 parts
        if ((partIndex + 1) % 100 === 0) {
          console.log(`Sent ${partIndex + 1}/${totalParts} parts for chunk ${chunkId}`);
        }
      } catch (error) {
        console.error(`Failed to send part ${partIndex + 1}:`, error);
        throw new Error(`Failed to send chunk part: ${error}`);
      }
    }

    // Wait for response
    return this.waitForChunkResponse(sessionId, chunkId);
  }

  /**
   * Close upload session
   */
  closeSession(sessionId: string): void {
    this.peerConnections.get(sessionId)?.close();
    this.peerConnections.delete(sessionId);
    this.activeSessions.delete(sessionId);

    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ type: 'P2P_CLOSE', sessionId }));
    }
  }

  /**
   * Cleanup all connections
   */
  destroy(): void {
    for (const sessionId of this.activeSessions.keys()) {
      this.closeSession(sessionId);
    }

    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }

  // Private helper methods
  private async getTurnCredentials(): Promise<void> {

    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        return;
      }

      const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
      const response = await this.http.get<TurnCredentialsResponse>(
        `${this.getApiUrl()}/webrtc/turn-credentials`,
        { headers }
      ).toPromise();

      if (response?.success && response.iceServers) {
        this.iceServers = response.iceServers;
      }
    } catch (error) {
      console.error('Failed to get TURN credentials, using default ICE servers:', error);
    }
  }

  private async setupWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.websocket = new WebSocket(this.WS_URL);
      this.websocket.onopen = () => resolve();
      this.websocket.onerror = reject;
      this.websocket.onmessage = (event) => this.handleSignalingMessage(JSON.parse(event.data));
    });
  }

  private async initiateP2PSession(nodeId: string, fileMetadata: any, token: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('P2P initiation timeout')), 10000);

      const messageHandler = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (data.type === 'P2P_READY') {
          clearTimeout(timeout);
          this.websocket!.removeEventListener('message', messageHandler);
          
          const session: P2PSession = {
            sessionId: data.sessionId,
            nodeId: nodeId,
            status: 'connecting',
            dataChannelReady: false
          };
          
          this.activeSessions.set(data.sessionId, session);
          this.sessionStatusSubject.next(session);
          resolve(data.sessionId);
        } else if (data.type === 'P2P_CLOSE') {
          clearTimeout(timeout);
          this.websocket!.removeEventListener('message', messageHandler);
          reject(new Error(data.reason || 'P2P initiation failed'));
        }
      };

      this.websocket!.addEventListener('message', messageHandler);
      this.websocket!.send(JSON.stringify({
        type: 'P2P_INITIATE',
        authToken: token,
        targetNodeId: nodeId,
        fileMetadata: fileMetadata
      }));
    });
  }

  private async createPeerConnection(sessionId: string): Promise<void> {
    const peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 0,
      bundlePolicy: 'balanced',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all'
    });
    
    this.peerConnections.set(sessionId, peerConnection);

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateStr = event.candidate.candidate;
        if (candidateStr.includes('.local')) {
          return;
        }
        
        // Only send IP-based candidates
        if (candidateStr.match(/\d+\.\d+\.\d+\.\d+/)) {
          this.sendSignalingMessage(sessionId, {
            type: 'ice-candidate',
            candidate: event.candidate
          });
        }
      }
    };

    // Handle connection state
    peerConnection.onconnectionstatechange = () => {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        if (peerConnection.connectionState === 'connected') {
          session.status = 'connected';
        } else if (['failed', 'disconnected'].includes(peerConnection.connectionState)) {
          session.status = 'failed';
          this.errorSubject.next(`WebRTC connection failed for session ${sessionId}`);
        } else {
          session.status = 'connecting';
        }
        this.sessionStatusSubject.next(session);
      }
    };

    // Create data channel
    const dataChannel = peerConnection.createDataChannel('fileTransfer', { 
      ordered: true,
      maxRetransmits: 3
    });
    
    // Set up message handler immediately
    const pendingResponses = new Map<string, { resolve: Function, reject: Function, timeout: ReturnType<typeof setTimeout> }>();
    
    dataChannel.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        
        // Handle STORED responses
        if (event.data.startsWith('STORED:')) {
          const chunkId = event.data.substring(7);
          const pending = pendingResponses.get(chunkId);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingResponses.delete(chunkId);
            pending.resolve();
          }
        }
        // Handle ERROR responses  
        else if (event.data.startsWith('ERROR:')) {
          const errorMsg = event.data.substring(6);
          console.log('Received error:', errorMsg);
          // Find and reject all pending responses
          for (const [chunkId, pending] of pendingResponses.entries()) {
            clearTimeout(pending.timeout);
            pendingResponses.delete(chunkId);
            pending.reject(new Error(errorMsg));
          }
        }
      }
    };
    
    dataChannel.onopen = () => {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.dataChannel = dataChannel;
        session.dataChannelReady = true;
        session.status = 'connected';
        session.pendingResponses = pendingResponses; // Store reference for waitForChunkResponse
        this.sessionStatusSubject.next(session);
      }
    };

    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    this.sendSignalingMessage(sessionId, { type: 'offer', sdp: offer.sdp });
  }

  private async handleSignalingMessage(data: any): Promise<void> {
    if (data.type !== 'P2P_RELAY') return;

    const peerConnection = this.peerConnections.get(data.sessionId);
    
    try {
      switch (data.payload.type) {
        case 'answer':
          if (peerConnection) {
            await peerConnection.setRemoteDescription({ type: 'answer', sdp: data.payload.sdp });
          }
          break;
        case 'ice-candidate':
          if (peerConnection) {
            await peerConnection.addIceCandidate(data.payload.candidate);
          }
          break;
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }

  private sendSignalingMessage(sessionId: string, payload: any): void {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'P2P_RELAY',
        sessionId: sessionId,
        payload: payload
      }));
    }
  }

  async waitForChunkResponse(sessionId: string, chunkId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    if (!session.pendingResponses) {
      throw new Error('Response handler not initialized');
    }

    // Check data channel state with more detailed logging
    if (!session.dataChannel) {
      console.error(`No data channel for session ${sessionId}`);
      throw new Error('Data channel not available - channel missing');
    }
    
    if (session.dataChannel.readyState !== 'open') {
      console.error(`Data channel not open for session ${sessionId}, state: ${session.dataChannel.readyState}`);
      throw new Error(`Data channel not available - state: ${session.dataChannel.readyState}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log('Timeout waiting for chunk response:', chunkId);
        session.pendingResponses!.delete(chunkId);
        reject(new Error(`Timeout waiting for chunk ${chunkId}`));
      }, 10000);

      // Register this response handler
      session.pendingResponses!.set(chunkId, { resolve, reject, timeout });
    });
  }
}
