// src/app/websocket/SecureWebSocketManager.js

// WebSocket security and connection management
const WebSocket = require('ws');
const bcrypt = require('bcryptjs');
const { StorageNode } = require('../models/User');

class SecureWebSocketManager {
  constructor() {
    this.connections = new Map();
    this.connectionAttempts = new Map(); // Track connection attempts per IP
    this.maxConnectionsPerIP = 10;
    this.maxConnectionAttemptsPerIP = 20;
    this.connectionAttemptWindow = 900000;
    this.pendingCommands = new Map();
    this.pendingFrameReconstructions = new Map();
  }

  // Check if IP is allowed to connect
  isIPAllowed(ip) {
    const attempts = this.connectionAttempts.get(ip);
    if (!attempts) return true;
    
    // Clean old attempts
    const now = Date.now();
    const recentAttempts = attempts.filter(timestamp => 
      now - timestamp < this.connectionAttemptWindow
    );
    
    this.connectionAttempts.set(ip, recentAttempts);
    
    return recentAttempts.length < this.maxConnectionAttemptsPerIP;
  }

  // Record connection attempt
  recordConnectionAttempt(ip) {
    const attempts = this.connectionAttempts.get(ip) || [];
    attempts.push(Date.now());
    this.connectionAttempts.set(ip, attempts);
  }

  // Count active connections for IP
  getConnectionCountForIP(ip) {
    let count = 0;
    for (const [nodeId, connection] of this.connections) {
      if (connection.ip === ip && connection.ws.readyState === WebSocket.OPEN) {
        count++;
      }
    }
    return count;
  }

  // Authenticate storage node connection
  async authenticateNode(nodeId, authToken) {
    try {
      const node = await StorageNode.findOne({ node_id: nodeId });
      if (!node) {
        throw new Error('Storage node not found');
      }

      // Compare with hashed token
      const isValid = await bcrypt.compare(authToken, node.auth_token);
      if (!isValid) {
        throw new Error('Invalid authentication token');
      }

      return node;
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  // Handle new WebSocket connection
  async handleConnection(ws, req) {
    const ip = req.socket.remoteAddress;
    
    try {
      // Check IP restrictions
      if (!this.isIPAllowed(ip)) {
        ws.close(1008, 'Too many connection attempts');
        return;
      }

      this.recordConnectionAttempt(ip);

      // Check connection limit per IP
      if (this.getConnectionCountForIP(ip) >= this.maxConnectionsPerIP) {
        ws.close(1008, 'Too many connections from this IP');
        return;
      }

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'Authentication timeout');
        }
      }, 30000); // 30 seconds to authenticate

      // Wait for authentication message
      ws.once('message', async (data) => {
        clearTimeout(connectionTimeout);
        
        try {
          const message = JSON.parse(data);
          
          if (message.type !== 'AUTH') {
            ws.close(1002, 'Authentication required');
            return;
          }

          const { node_id, token } = message;
          if (!node_id || !token) {
            ws.close(1002, 'Invalid authentication data');
            return;
          }

          // Authenticate the node
          const node = await this.authenticateNode(node_id, token);

          // Check if node is already connected
          if (this.connections.has(node_id)) {
            const existingConnection = this.connections.get(node_id);
            if (existingConnection.ws.readyState === WebSocket.OPEN) {
              // Close existing connection
              existingConnection.ws.close(1000, 'New connection established');
            }
          }

          // Store connection with metadata
          ws.nodeId = node_id;
          this.connections.set(node_id, {
            ws,
            ip,
            node,
            connectedAt: new Date(),
            lastPing: new Date()
          });

          // Update node status in database
          await StorageNode.findOneAndUpdate(
            { node_id },
            { 
              status: 'online',
              last_seen: new Date()
            }
          );

          // Set up connection event handlers
          this.setupConnectionHandlers(ws, node_id);

          // Send authentication success
          ws.send(JSON.stringify({
            type: 'AUTH_SUCCESS',
            message: 'Authentication successful'
          }));

          // Request a status update
          let id;
          do {
            id = 'cmd-' + require('crypto').randomBytes(8).toString('hex');
          } while (this.pendingCommands.has(id));
          const command = {
            command_type: 'STATUS_REQUEST',
            command_id: id
          };

          ws.send(JSON.stringify(command));

        } catch (error) {
          console.error('WebSocket authentication error:', error);
          ws.close(1002, 'Authentication failed');
        }
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(1011, 'Server error');
    }
  }

  // Set up event handlers for authenticated connection
  setupConnectionHandlers(ws, nodeId) {
    // Handle messages
    ws.on('message', async (message, isBinary) => {
      try {
        if (isBinary) {
          await this.handleWebSocketBinary(message, ws);
        } else {
          await this.handleWebSocketText(message.toString(), ws);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    });

    // Handle connection close
    ws.on('close', async (code, reason) => {      
      // Update node status in database
      try {
        await StorageNode.findOneAndUpdate(
          { node_id: nodeId },
          { 
            status: 'offline',
            last_seen: new Date()
          }
        );
      } catch (error) {
        console.error('Error updating node status on disconnect:', error);
      }

      // Remove from connections
      this.connections.delete(nodeId);
    });

    // Handle connection error
    ws.on('error', (error) => {
      console.error(`WebSocket error for node ${nodeId}:`, error);
    });

    // Set up ping/pong for keepalive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        const connection = this.connections.get(nodeId);
        if (connection) {
          connection.lastPing = new Date();
        }
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Ping every 30 seconds

    ws.on('pong', () => {
      const connection = this.connections.get(nodeId);
      if (connection) {
        connection.lastPing = new Date();
      }
    });
  }

  // Handle incoming text messages from storage nodes
  async handleWebSocketText(message, ws) {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'AUTH':
        // This should not happen as auth is handled in handleConnection
        console.warn('Received AUTH message after connection established');
        break;
        
      case 'COMMAND_RESULT':
        await this.handleCommandResult(data, ws);
        break;

      case 'STATUS_REPORT':
        // Handle status reports from storage client
        if (data.status && ws.nodeId) {
          // Update node status in database with fresh data
          try {
            await StorageNode.findOneAndUpdate(
              { node_id: ws.nodeId },
              {
                status: 'online',
                used_space: data.status.used_space_bytes || 0,
                total_available_space: data.status.max_space_bytes || 0,
                num_chunks: data.status.current_chunk_count || 0,
                last_seen: null
              },
              { new: true }
            );
          } catch (error) {
            console.error(`Error updating node ${ws.nodeId} storage status:`, error);
          }
        }
        // Resolve any pending commands waiting for this status report
        if (this.pendingCommands.has(data.command_id)) {
          const resolve = this.pendingCommands.get(data.command_id);
          this.pendingCommands.delete(data.command_id);
          resolve(data);
        }
        break;

      default:
        console.log('Unknown message type:', data);
        break;
    }
  }

  // Handle incoming binary messages from storage nodes
  async handleWebSocketBinary(message, ws) {
    if (message.length < 4) {
      throw new Error('Binary message too short');
    }
    
    // Read JSON header length (first 4 bytes, little-endian)
    const jsonLength = message.readUInt32LE(0);
    
    // Extract JSON header
    const jsonData = message.subarray(4, 4 + jsonLength);
    const data = JSON.parse(jsonData.toString('utf8'));
    
    // Extract binary payload
    const binaryPayload = message.subarray(4 + jsonLength);
    
    // Handle binary command result
    if (data.type === 'GET_CHUNK_RESULT' && data.data_size !== undefined) {
      if (binaryPayload.length !== data.data_size) {
        throw new Error(`Binary payload size mismatch: expected ${data.data_size}, got ${binaryPayload.length}`);
      }
      
      // Handle framed GET_CHUNK_RESULT
      await this.handleFramedGetChunkResult(data, binaryPayload, ws);
    } else {
      // For other binary message types, just log and ignore
      console.warn(`Unknown received binary message of type ${data.type} with command_id ${data.command_id}`);
    }
  }

  // Handle framed GET_CHUNK_RESULT responses
  async handleFramedGetChunkResult(data, binaryPayload, ws) {
    const { command_id, frame_number, total_frames } = data;
    
    if (!frame_number || !total_frames) {
      // Single frame response
      data.data = binaryPayload;
      delete data.data_size;
      await this.handleCommandResult(data, ws);
      return;
    }
    
    // Multi-frame response - reconstruct
    const frameKey = command_id;
    
    if (!this.pendingFrameReconstructions.has(frameKey)) {
      this.pendingFrameReconstructions.set(frameKey, {
        frames: new Map(),
        total_frames,
        received_count: 0,
        command_data: { ...data }
      });
    }
    
    const reconstruction = this.pendingFrameReconstructions.get(frameKey);
    
    // Add this frame
    if (!reconstruction.frames.has(frame_number)) {
      reconstruction.frames.set(frame_number, binaryPayload);
      reconstruction.received_count++;
    }
    
    // Check if complete
    if (reconstruction.received_count === total_frames) {
      // Reconstruct the full binary data
      const fullData = Buffer.alloc(
        Array.from(reconstruction.frames.values())
          .reduce((total, frame) => total + frame.length, 0)
      );
      
      let offset = 0;
      for (let i = 1; i <= total_frames; i++) {
        const frameData = reconstruction.frames.get(i);
        if (!frameData) {
          throw new Error(`Missing frame ${i} of ${total_frames} for command ${command_id}`);
        }
        frameData.copy(fullData, offset);
        offset += frameData.length;
      }
      
      // Clean up and process complete response
      this.pendingFrameReconstructions.delete(frameKey);
      
      const completeResponse = {
        ...reconstruction.command_data,
        data: fullData
      };
      delete completeResponse.data_size;
      delete completeResponse.frame_number;
      delete completeResponse.total_frames;
      
      // Process the complete response
      await this.handleCommandResult(completeResponse, ws);
    }
  }

  // Handle command results from storage nodes
  async handleCommandResult(data, ws) {
    if (!data.success && data.error) {
      console.error(`Command error: ${data.error}`);
    }
    
    // Update storage node metrics for successful operations with storage impact
    if (data.success && ws.nodeId && data.storage_delta !== undefined && data.storage_delta !== null) {
      try {
        const storageDelta = data.storage_delta;
        const chunkDelta = storageDelta > 0 ? 1 : (storageDelta < 0 ? -1 : 0);
        
        if (storageDelta !== 0 || chunkDelta !== 0) {
          const updateFields = {};
          if (storageDelta !== 0) {
            updateFields.used_space = storageDelta;
          }
          if (chunkDelta !== 0) {
            updateFields.num_chunks = chunkDelta;
          }
          
          await StorageNode.findOneAndUpdate(
            { node_id: ws.nodeId },
            { $inc: updateFields },
            { new: true }
          );
        }
      } catch (error) {
        console.error(`Error updating node ${ws.nodeId} metrics:`, error);
      }
    }
    
    // Resolve any pending commands waiting for this result
    if (this.pendingCommands.has(data.command_id)) {
      const resolve = this.pendingCommands.get(data.command_id);
      this.pendingCommands.delete(data.command_id);
      resolve(data);
    }
  }

  // Send offer to storage node
  sendToNode(nodeId, message) {
    const connection = this.connections.get(nodeId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify(message));
        return true;
    }
    return false;
  }

  // Get connection by node ID
  getConnection(nodeId) {
    const connection = this.connections.get(nodeId);
    return connection ? connection.ws : null;
  }

  // Get all connections (for use by storage routes)
  getNodeConnections() {
    const nodeConnections = new Map();
    for (const [nodeId, connection] of this.connections) {
      nodeConnections.set(nodeId, connection.ws);
    }
    return nodeConnections;
  }

  // Get pending commands (for use by storage routes)
  getPendingCommands() {
    return this.pendingCommands;
  }

  // Get pending frame reconstructions (for use by storage routes)
  getPendingFrameReconstructions() {
    return this.pendingFrameReconstructions;
  }

  // Clean up old connection attempts
  cleanup() {
    const now = Date.now();
    for (const [ip, attempts] of this.connectionAttempts) {
      const recentAttempts = attempts.filter(timestamp => 
        now - timestamp < this.connectionAttemptWindow
      );
      
      if (recentAttempts.length === 0) {
        this.connectionAttempts.delete(ip);
      } else {
        this.connectionAttempts.set(ip, recentAttempts);
      }
    }
  }
}

module.exports = SecureWebSocketManager;
