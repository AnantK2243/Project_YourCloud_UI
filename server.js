const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 8080;

// Load SSL certificates (required for HTTPS-only mode)
let sslOptions = {};
try {
  sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'ssl', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl', 'cert.pem'))
  };
  console.log('SSL certificates loaded successfully');
} catch (error) {
  console.error('SSL certificates not found. HTTPS-only mode requires SSL certificates.');
  console.error('Please ensure ssl/key.pem and ssl/cert.pem exist in the project directory.');
  process.exit(1);
}

// Configure CORS to allow requests from frontend (HTTPS only)
app.use(cors({
  origin: ['https://localhost:4200', 'https://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Add a simple request logger
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// MongoDB Atlas connection
mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('Connected to MongoDB Atlas');
}).catch((error) => {
  console.error('MongoDB Atlas connection error:', error);
});

const StorageNodeSchema = new mongoose.Schema({
  node_id: { type: String, unique: true, required: true },
  auth_token: String,
  status: { type: String, default: 'offline' },
  total_available_space: { type: Number, default: 0 },
  used_space: { type: Number, default: 0 },
  num_chunks: { type: Number, default: 0},
  last_seen: { type: Date, default: Date.now },
  hostname: String,
  os_version: String,
  endpoint: String
});

const StorageNode = mongoose.model('StorageNode', StorageNodeSchema);

// File Schema for your cloud storage
const FileSchema = new mongoose.Schema({
  path: { type: String, required: true },
  name: { type: String, required: true },
  size: Number,
  type: { type: String, enum: ['file', 'directory'], required: true },
  owner: String,
  parent_path: String,
  chunk_ids: [String],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const File = mongoose.model('File', FileSchema);

const ChunkSchema = new mongoose.Schema({
  chunk_id: { type: String, unique: true, required: true },
  file_id: mongoose.Schema.Types.ObjectId,
  sequence_number: Number,
  size: Number,
  storage_nodes: [String],
  checksum: String,
  created_at: { type: Date, default: Date.now }
});

const Chunk = mongoose.model('Chunk', ChunkSchema);

// Storage for pending commands awaiting responses
const pendingCommands = new Map();

// Generate unique command IDs
function generateCommandId() {
  return 'cmd-' + require('crypto').randomBytes(8).toString('hex');
}

// Helper function to update node storage status
async function updateNodeStatus(nodeId) {
  try {
    // Find the node in the database
    const node = await StorageNode.findOne({ node_id: nodeId });
    if (!node) {
      console.error(`Node ${nodeId} not found in database`);
      return null;
    }

    // Check if node is connected via WebSocket
    const ws = nodeConnections.get(nodeId);
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    
    let updateData = {};

    // Request node status status
    if (isConnected) {
      updateData.status = 'online';
      updateData.last_seen = new Date(); // Set last_seen

      const statusCommand = {
        command_type: 'STATUS_REQUEST',
        command_id: generateCommandId()
      };

      // Send status request and wait for response
      return new Promise((resolve) => {
        // Store the resolve function to call when response arrives
        pendingCommands.set(statusCommand.command_id, (result) => {
          if (result.type === 'STATUS_REPORT' && result.status) {
            // Just resolve with the data - database is already updated by WebSocket handler
            console.log(`Node ${nodeId} status request completed with fresh data`);
            resolve({
              status: 'online',
              used_space: result.status.used_space_bytes || node.used_space,
              total_available_space: result.status.max_space_bytes || node.total_available_space,
              num_chunks: result.status.current_chunk_count || node.num_chunks,
              last_seen: new Date(),
              node_id: nodeId,
              message: 'Server connected',
              endpoint: node.endpoint
            });
          } else {
            // Status request failed or no detailed status, update with current updateData
            StorageNode.findOneAndUpdate({ node_id: nodeId }, updateData, { new: true }).then(() => {
              console.log(`Node ${nodeId} status updated (online, but status request failed or no detail):`, updateData);
              resolve({
                ...updateData,
                node_id: nodeId,
                message: 'Server connected',
                endpoint: node.endpoint,
                used_space: node.used_space || 0,
                total_available_space: node.total_available_space || 0
              });
            }).catch((error) => {
              console.error(`Error updating node ${nodeId} (online, status request failed):`, error);
              resolve(null);
            });
          }
        });

        // Set timeout for status request
        setTimeout(() => {
          if (pendingCommands.has(statusCommand.command_id)) {
            pendingCommands.delete(statusCommand.command_id);
            StorageNode.findOneAndUpdate(
              { node_id: nodeId },
              updateData, 
              { new: true }
            ).then(() => {
              console.log(`Status request timeout for node ${nodeId}. Updated status:`, updateData);
              resolve({
                ...updateData,
                node_id: nodeId,
                message: 'Server connected',
                endpoint: node.endpoint,
                used_space: node.used_space || 0,
                total_available_space: node.total_available_space || 0
              });
            }).catch((error) => {
              console.error(`Error updating node ${nodeId} after timeout:`, error);
              resolve(null);
            });
          }
        }, 1000); // 1 second timeout (reduced from 5 seconds)

        // Send the command
        ws.send(JSON.stringify(statusCommand));
      });
    } else {
      // Node is not connected
      updateData.status = 'offline';
      const lastSeen = node.last_seen;
      const timeSinceLastSeen = lastSeen ? Math.floor((new Date() - new Date(lastSeen)) / 1000 / 60) : null;
      
      await StorageNode.findOneAndUpdate(
        { node_id: nodeId },
        updateData,
        { new: true }
      );

      console.log(`Node ${nodeId} status updated:`, updateData); 
      return {
        ...updateData,
        node_id: nodeId,
        message: timeSinceLastSeen ? `Last seen ${timeSinceLastSeen} minutes ago` : 'Never connected',
        endpoint: node.endpoint,
        used_space: node.used_space || 0,
        total_available_space: node.total_available_space || 0,
        last_seen: lastSeen
      };
    }
  } catch (error) {
    console.error(`Error updating node ${nodeId} status:`, error);
    return null;
  }
}

// Routes

// Storage Node Status Check
app.post('/api/check-status', async (req, res) => {
  try {
    const { node_id } = req.body;
    
    if (!node_id) {
      return res.status(400).json({
        success: false,
        error: 'node_id is required'
      });
    }
    
    console.log(`Manual status check requested for node: ${node_id}`);
    
    // Check if node exists in database
    const nodeExists = await StorageNode.findOne({ node_id });
    if (!nodeExists) {
      return res.status(404).json({
        success: false,
        error: `Node ${node_id} not found`
      });
    }
    
    // Get status for the specific node
    const nodeStatus = await updateNodeStatus(node_id);
    
    if (!nodeStatus) {
      return res.status(500).json({
        success: false,
        error: `Failed to update status for node ${node_id}`
      });
    }
    
    res.json({
      success: true,
      node_id,
      node_status: nodeStatus
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Storage Client Endpoints

// Storage node registration
app.post('/api/register-node', async (req, res) => {
  try {
    // Rust client sends: { available_max_gib: u64, system_info: { hostname, os_version } }
    const { available_max_gib, system_info } = req.body;
    
    // Generate a random unused node_id
    let node_id;
    let isUnique = false;
    
    while (!isUnique) {
      node_id = 'node-' + require('crypto').randomBytes(8).toString('hex');
      const existingNode = await StorageNode.findOne({ node_id });
      if (!existingNode) {
        isUnique = true;
      }
    }

    const auth_token = require('crypto').randomBytes(32).toString('hex');

    // Create new node with generated node_id and system info
    const node = new StorageNode({
      node_id,
      auth_token,
      status: 'offline', // Set to offline initially, will be online when WebSocket connects
      total_available_space: available_max_gib ? available_max_gib * 1024 * 1024 * 1024 : 0, // Convert GiB to bytes
      used_space: 0,
      num_chunks: 0,
      hostname: system_info.hostname,
      os_version: system_info.os_version,
      last_seen: new Date()
    });

    await node.save();

    console.log(`New storage node registered: ${node_id} (${system_info.hostname})`);

    // Rust client expects: { node_id: String, auth_token: String }
    res.json({
      node_id,
      auth_token
    });
  } catch (error) {
    console.error('Error registering node:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Store WebSocket connections by node_id for command routing
const nodeConnections = new Map();

// WebSocket server with SSL
const httpsServerForWS = https.createServer(sslOptions);
const wss = new WebSocket.Server({ server: httpsServerForWS });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received WebSocket message:', data);

      // Handle different message types
      switch (data.type) {
        case 'AUTH':
          // Verify the node_id and token against the database
          const node = await StorageNode.findOne({ 
            node_id: data.node_id, 
            auth_token: data.token 
          });
          if (node) {
            // Store connection for command routing
            ws.nodeId = data.node_id;
            nodeConnections.set(data.node_id, ws);
            
            // Update node status to online and set endpoint
            try {
              const clientEndpoint = `${ws._socket.remoteAddress}:${ws._socket.remotePort}`;
              await StorageNode.findOneAndUpdate(
                { node_id: data.node_id },
                { 
                  status: 'online',
                  last_seen: new Date(),
                  endpoint: clientEndpoint
                },
                { new: true }
              );
              console.log(`Node ${data.node_id} status updated to online with endpoint: ${clientEndpoint}`);
            } catch (error) {
              console.error(`Error updating node ${data.node_id} status:`, error);
            }
            
            ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', message: 'Authentication successful' }));
            console.log(`Node ${data.node_id} authenticated successfully`);
          } else {
            ws.send(JSON.stringify({ type: 'AUTH_FAILED', message: 'Invalid credentials' }));
            console.log(`Authentication failed for node ${data.node_id}`);
          }
          break;
          
        case 'COMMAND_RESULT':
          // Handle command results from storage client
          console.log(`Command result for ${data.command_id}: ${data.success ? 'SUCCESS' : 'FAILED'}`);
          if (!data.success && data.error) {
            console.error(`Command error: ${data.error}`);
          }
          // Store command result for any waiting requests
          if (pendingCommands.has(data.command_id)) {
            const resolve = pendingCommands.get(data.command_id);
            pendingCommands.delete(data.command_id);
            resolve(data);
          }
          break;
          
        case 'STATUS_REPORT':
          // Handle status reports from storage client
          console.log(`Status report for ${data.command_id}:`, data.status);
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
                  last_seen: new Date()
                },
                { new: true }
              );
              console.log(`Node ${ws.nodeId} storage status updated from status report`);
            } catch (error) {
              console.error(`Error updating node ${ws.nodeId} storage status:`, error);
            }
          }
          // Resolve any pending commands waiting for this status report
          if (pendingCommands.has(data.command_id)) {
            const resolve = pendingCommands.get(data.command_id);
            pendingCommands.delete(data.command_id);
            resolve(data);
          }
          break;
          
        default:
          console.log('Unknown message type:', data.type);
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    if (ws.isUIClient) {
      // UI client disconnecting
      if (typeof uiConnections !== 'undefined') {
        uiConnections.delete(ws);
        console.log(`UI client disconnected. Remaining UI connections: ${uiConnections.size}`);
      }
    } else if (ws.nodeId) {
      // Storage client disconnecting - update status to offline
      nodeConnections.delete(ws.nodeId);
      
      // Update node status to offline
      StorageNode.findOneAndUpdate(
        { node_id: ws.nodeId },
        { 
          status: 'offline',
          last_seen: new Date()
        },
        { new: true }
      ).then(() => {
        console.log(`Storage client ${ws.nodeId} disconnected and status updated to offline`);
      }).catch((error) => {
        console.error(`Error updating node ${ws.nodeId} status to offline:`, error);
      });
    } else {
      console.log('Unknown client disconnected');
    }
  });
});

// Start HTTPS server only
const httpsServer = https.createServer(sslOptions, app);
httpsServer.listen(PORT, () => {
  console.log(`HTTPS Backend server running on port ${PORT}`);
  console.log(`MongoDB Atlas connection status: ${mongoose.connection.readyState === 1 ? 'connected' : 'connecting...'}`);
});

// Start the secure WebSocket server
httpsServerForWS.listen(WS_PORT, () => {
  console.log(`Secure WebSocket server (WSS) running on port ${WS_PORT}`);
});