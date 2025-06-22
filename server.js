const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const APP_PORT = process.env.APP_PORT || 4200;

// Configure CORS based on environment
const allowedOrigins = [`https://localhost:${APP_PORT}`];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Connection']
}));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'dist/user_interface/browser')));

// Add a simple request logger
app.use((req, res, next) => {
  // console.log(`Incoming request: ${req.method} ${req.url}`);
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
  label: String,
  root_directory_initialized: { type: Boolean, default: false },
  owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const StorageNode = mongoose.model('StorageNode', StorageNodeSchema);

// User Schema for authentication
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  salt: { type: String, required: true },
  storage_nodes: [{ type: String }],
  created_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// Helper functions

// Storage for pending commands awaiting responses
const pendingCommands = new Map();

// Storage for frame reconstruction
const pendingFrameReconstructions = new Map();

// Generate unique command IDs
function generateCommandId() {
  return 'cmd-' + require('crypto').randomBytes(8).toString('hex');
}

// Validates user owns the storage node
async function validateUserOwnsNode(userId, nodeId) {
  const user = await User.findById(userId);
  if (!user || !user.storage_nodes || !user.storage_nodes.includes(nodeId)) {
    throw new Error('User does not own this storage node');
  }
  
  const ws = nodeConnections.get(nodeId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error(`Storage node ${nodeId} is not connected`);
  }
  
  return true;
}

// Updates storage node status
async function updateNodeStatus(nodeId) {
  try {
    const ws = nodeConnections.get(nodeId);
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    
    if (isConnected) {
      const statusCommand = {
        command_type: 'STATUS_REQUEST',
        command_id: generateCommandId()
      };

      // Send status request and handle response in background
      pendingCommands.set(statusCommand.command_id, (result) => {
        if (result.type === 'STATUS_REPORT' && result.status) {
          StorageNode.findOneAndUpdate(
            { node_id: nodeId },
            {
              status: 'online',
              used_space: result.status.used_space_bytes || 0,
              total_available_space: result.status.max_space_bytes || 0,
              num_chunks: result.status.current_chunk_count || 0,
              last_seen: null
            },
            { new: true }
          ).catch((error) => {
            console.error(`Error updating node ${nodeId} database:`, error);
          });
        } else {
          console.log(`Node ${nodeId} status request failed but node is still appears online`);
          StorageNode.findOneAndUpdate(
            { node_id: nodeId },
            {
              status: 'online',
              last_seen: null
            },
            { new: true }
          ).catch((error) => {
            console.error(`Error updating node ${nodeId} status to online:`, error);
          });
        }
      });

      // Set timeout for status request
      setTimeout(() => {
        if (pendingCommands.has(statusCommand.command_id)) {
          pendingCommands.delete(statusCommand.command_id);
          console.log(`Status request timeout for node ${nodeId} but node is still online`);
          StorageNode.findOneAndUpdate(
            { node_id: nodeId },
            {
              status: 'online',
              last_seen: null
            },
            { new: true }
          ).catch((error) => {
            console.error(`Error updating node ${nodeId} status after timeout:`, error);
          });
        }
      }, 1000); // 1 second timeout

      // Send the command
      ws.send(JSON.stringify(statusCommand));

      // Return immediately without waiting for response
      return {
        status: 'online',
        node_id: nodeId
      };
    } else {
      // Node is not connected
      const nodeInDb = await StorageNode.findOne({ node_id: nodeId });

      return {
        status: 'offline',
        node_id: nodeId,
        last_seen: nodeInDb.last_seen
      };
    }
  } catch (error) {
    console.error(`Error updating node ${nodeId} status:`, error);
    return null;
  }
}

// Token blacklist for logout functionality
const tokenBlacklist = new Map();

// Function to clean up expired tokens from the blacklist
function cleanupExpiredTokens() {
  const now = Date.now();
  let cleanedCount = 0;
  for (const [token, expiresAt] of tokenBlacklist.entries()) {
    if (expiresAt < now) {
      tokenBlacklist.delete(token);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    console.log(`Cleaned ${cleanedCount} expired token(s) from the blacklist.`);
  }
}

// Periodically clean up the blacklist
const cleanupInterval = 24 * 60 * 60 * 1000;
setInterval(cleanupExpiredTokens, cleanupInterval);
console.log(`Token blacklist cleanup job scheduled to run every ${cleanupInterval / (60 * 60 * 1000)} hours.`);

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  // Check if token is blacklisted
  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ success: false, message: 'Token has been invalidated' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    req.token = token;
    next();
  });
};

// Storage Management Helper Functions

// Send command to storage node and wait for response
async function sendStorageNodeCommand(nodeId, command) {
  return new Promise((resolve, reject) => {
    const ws = nodeConnections.get(nodeId);
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error(`Storage node ${nodeId} is not connected`));
      return;
    }

    const commandId = generateCommandId();
    const fullCommand = {
      ...command,
      command_id: commandId
    };

    // Set up response handler
    pendingCommands.set(commandId, (result) => {
      if (result.success) {
        resolve(result);
      } else {
        reject(new Error(result.error || 'Command failed'));
      }
    });

    // Set timeout
    setTimeout(() => {
      if (pendingCommands.has(commandId)) {
        pendingCommands.delete(commandId);
        reject(new Error('Command timeout'));
      }
    }, 30000); // 30 second timeout

    try {
      ws.send(JSON.stringify(fullCommand));
    } catch (error) {
      pendingCommands.delete(commandId);
      reject(error);
    }
  });
}

// Send store command with data
async function sendStoreCommand(nodeId, command, binaryData) {
  return new Promise(async (resolve, reject) => {
    const ws = nodeConnections.get(nodeId);
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error(`Storage node ${nodeId} is not connected`));
      return;
    }

    const commandId = generateCommandId();
    const fullCommand = {
      ...command,
      command_id: commandId
    };

    // Set up response handler
    pendingCommands.set(commandId, (result) => {
      if (result.success) {
        resolve(result);
      } else {
        reject(new Error(result.error || 'Command failed'));
      }
    });

    // Set timeout
    setTimeout(() => {
      if (pendingCommands.has(commandId)) {
        pendingCommands.delete(commandId);
        reject(new Error('Command timeout'));
      }
    }, 30000); // 30 second timeout

    try {
      // Define max chunk size for binary data (16MB)
      const MAX_BINARY_FRAME_SIZE = 32 * 1024 * 1024; // 32MB

      if (binaryData.length <= MAX_BINARY_FRAME_SIZE) {
        // Send as single chunk
        const frameCommand = {
          ...fullCommand,
          frame_number: 1,
          total_frames: 1
        };

        await sendSingleFrame(ws, frameCommand, binaryData);
      } else {
        // Split into multiple frames
        const totalFrames = Math.ceil(binaryData.length / MAX_BINARY_FRAME_SIZE);

        for (let i = 0; i < totalFrames; i++) {
          const start = i * MAX_BINARY_FRAME_SIZE;
          const end = Math.min(start + MAX_BINARY_FRAME_SIZE, binaryData.length);
          const frameData = binaryData.slice(start, end);

          const frameCommand = {
            ...fullCommand,
            frame_number: i + 1,
            total_frames: totalFrames
          };

          await sendSingleFrame(ws, frameCommand, frameData);

          // Small delay between frames to prevent overwhelming the client
          if (i < totalFrames - 1) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      }
    } catch (error) {
      pendingCommands.delete(commandId);
      reject(error);
    }
  });
}

// Helper function to send a single frame
async function sendSingleFrame(ws, command, binaryData) {
  try {
    // Create combined binary message: [4 bytes: json_length][json][binary_data]
      const jsonString = JSON.stringify(command);
      const jsonBytes = Buffer.from(jsonString, 'utf8');
      
      // Create combined message buffer
      const combinedMessage = Buffer.alloc(4 + jsonBytes.length + binaryData.length);
      
      // Write JSON length as 4-byte little-endian integer
      combinedMessage.writeUInt32LE(jsonBytes.length, 0);
      
      // Write JSON command
      jsonBytes.copy(combinedMessage, 4);
      
      // Write binary data
      binaryData.copy(combinedMessage, 4 + jsonBytes.length);
      
      // Send as single binary WebSocket message
      ws.send(combinedMessage);
    } catch (error) {
      pendingCommands.delete(commandId);
      throw error;
    }
}
// API Routes

// Health check endpoint for testing connectivity
app.get('/api/health-check', (req, res) => {
  const status = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    version: '1.0.0'
  };
  res.json(status);
});

// Simple health endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Logout endpoint to blacklist token
app.post('/api/logout', authenticateToken, (req, res) => {
  try {
    const token = req.token;
    const decodedUser = req.user; // Decoded payload from authenticateToken

    if (token && decodedUser && decodedUser.iat) {
      // Calculate expiry time: iat is in seconds, expiresIn is '24h'
      const issuedAtMillis = decodedUser.iat * 1000;
      const twentyFourHoursInMillis = 24 * 60 * 60 * 1000;
      const expiresAt = issuedAtMillis + twentyFourHoursInMillis;
      
      tokenBlacklist.set(token, expiresAt);
      // console.log(`Token blacklisted for user ${decodedUser.email}, will be auto-cleaned after ${new Date(expiresAt).toISOString()}`);
    } else {
      // Fallback if iat is not available for some reason, blacklist without auto-cleanup info
      tokenBlacklist.set(token, Date.now() + (24 * 60 * 60 * 1000));
      console.warn(`Token blacklisted for user (iat not found), will be auto-cleaned in 24h from now.`);
    }
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, salt } = req.body;

    if (!name || !email || !password || !salt) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and salt are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      salt: salt
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email, 
        name: user.name,
        iat: Math.floor(Date.now() / 1000) // Issued at time
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: '24h',
        issuer: 'yourcloud-api',
        audience: 'yourcloud-users'
      }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        salt: user.salt
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

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
    
    const nodeStatus = await updateNodeStatus(node_id);
    
    if (!nodeStatus) {
      return res.status(500).json({
        success: false,
        error: `Failed to update status for node ${node_id}`
      });
    }

    return res.json({
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

// Storage Node Registration
app.post('/api/register-node', authenticateToken, async (req, res) => {
  try {
    const { node_name } = req.body;
    
    if (!node_name || !node_name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'node_name is required'
      });
    }

    // Generate a random unused node_id
    let node_id;
    let isUnique = false;
    
    while (!isUnique) {
      node_id = require('crypto').randomBytes(8).toString('hex');
      const existingNode = await StorageNode.findOne({ node_id });
      if (!existingNode) {
        isUnique = true;
      }
    }

    const auth_token = require('crypto').randomBytes(64).toString('hex');
    // Hash the auth token before storing in database
    const hashedAuthToken = await bcrypt.hash(auth_token, 10);

    // Create new node with generated node_id and user-provided name
    const node = new StorageNode({
      node_id,
      auth_token: hashedAuthToken,
      status: 'offline',
      total_available_space: -1,
      used_space: 0,
      num_chunks: 0,
      last_seen: null,
      label: node_name,
      owner_user_id: req.user.userId // Associate node with the user
    });

    await node.save();

    // Set timeout to delete node if it doesn't connect within 5 minutes
    setTimeout(async () => {
      try {
        // Check if node still exists and is offline
        const nodeCheck = await StorageNode.findOne({ node_id });
        if (nodeCheck && nodeCheck.status === 'offline' && nodeCheck.last_seen === null) {
          // Node never connected, remove it from database
          await StorageNode.deleteOne({ node_id });
          
          // Remove node_id from user's storage_nodes array
          await User.findByIdAndUpdate(
            req.user.userId,
            { $pull: { storage_nodes: node_id } }
          );
        }
      } catch (error) {
        console.error('Error cleaning up unconnected node:', error);
      }
    }, 5 * 60 * 1000);

    // Add the node_id to the user's storage_nodes array
    await User.findByIdAndUpdate(
      req.user.userId,
      { $addToSet: { storage_nodes: node_id } }, // $addToSet prevents duplicates
      { new: true }
    );

    // console.log(`New storage node registered: ${node_id} (${node_name.trim()}) for user ${req.user.email}`);

    res.json({
      success: true,
      node_id,
      auth_token,
      node_name: node_name.trim(),
      message: 'Node registered successfully'
    });
  } catch (error) {
    console.error('Error registering node:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user's storage nodes
app.get('/api/user/storage-nodes', authenticateToken, async (req, res) => {
  try {
    // console.log('Fetching storage nodes for user:', req.user.userId);
    
    const user = await User.findById(req.user.userId);
    // console.log('Found user:', user ? { id: user._id, email: user.email, storage_nodes: user.storage_nodes } : 'null');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get detailed information about each storage node
    const storageNodes = await StorageNode.find({
      node_id: { $in: user.storage_nodes }
    }).select('-auth_token'); // Exclude auth_token for security

    // console.log('Found storage nodes:', storageNodes.length);

    res.json({
      success: true,
      storage_nodes: storageNodes
    });

  } catch (error) {
    console.error('Error fetching user storage nodes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch storage nodes'
    });
  }
});

// Check/Mark root as initialized
app.get('/api/node/:nodeId/initialize-root', authenticateToken, async (req, res) => {
  try {
    const { nodeId } = req.params;

    // Validate user owns this storage node
    await validateUserOwnsNode(req.user.userId, nodeId);
    
    const node = await StorageNode.findOne({ node_id: nodeId });

    if (!node) {
      return res.status(404).json({
        success: false,
        error: 'Storage node not found'
      });
    }

    let wasInitialized = false;
    if (node.root_directory_initialized !== true) {
      node.root_directory_initialized = true;
      await node.save();
      wasInitialized = true;
    }

    res.json({
      success: true,
      wasInitialized: wasInitialized,
    });

  } catch (error) {
    console.error('Error marking root directory as initialized:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Store chunk endpoint
app.post('/api/chunks/store/:nodeId/:chunkId', authenticateToken, async (req, res) => {
  try {
    const { nodeId, chunkId } = req.params;
    
    if (!nodeId || !chunkId) {
      return res.status(400).json({
        success: false,
        error: 'Node ID and Chunk ID are required'
      });
    }

    // Validate user owns this storage node
    await validateUserOwnsNode(req.user.userId, nodeId);

    // Collect raw binary data
    const chunks = [];
    
    req.on('data', chunk => {
      chunks.push(chunk);
    });

    req.on('end', async () => {
      try {
        const chunkData = Buffer.concat(chunks);
        
        if (chunkData.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No data provided'
          });
        }
        
        // Send STORE_CHUNK command with binary data
        const result = await sendStoreCommand(nodeId, {
          command_type: 'STORE_CHUNK',
          chunk_id: chunkId,
          data_size: chunkData.length
        }, chunkData);

        res.json({ success: true });
        
      } catch (error) {
        console.error('Error storing chunk:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    });

  } catch (error) {
    console.error('Error in store chunk endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get chunk endpoint
app.get('/api/chunks/get/:nodeId/:chunkId', authenticateToken, async (req, res) => {
  try {
    const { nodeId, chunkId } = req.params;
    
    if (!nodeId || !chunkId) {
      return res.status(400).json({
        success: false,
        error: 'Node ID and Chunk ID are required'
      });
    }

    // Validate user owns this storage node
    await validateUserOwnsNode(req.user.userId, nodeId);
    
    // Send GET_CHUNK command
    const result = await sendStorageNodeCommand(nodeId, {
      command_type: 'GET_CHUNK',
      chunk_id: chunkId
    });

    if (result.success && result.data) {
      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-Length', result.data.length.toString());
      res.send(result.data);
    } else {
      res.status(404).json({
        success: false,
        error: result.error || 'Chunk not found'
      });
    }

  } catch (error) {
    console.error('Error retrieving chunk:', error);
    
    // Check for specific error types
    if (error.message.includes('not found') || error.message.includes('Chunk not found')) {
      res.status(404).json({
        success: false,
        error: 'Chunk not found'
      });
    } else if (error.message.includes('not connected')) {
      res.status(503).json({
        success: false,
        error: 'Storage node is not available'
      });
    } else if (error.message.includes('does not own')) {
      res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }
});

// Delete chunk endpoint
app.delete('/api/chunks/delete/:nodeId/:chunkId', authenticateToken, async (req, res) => {
  try {
    const { nodeId, chunkId } = req.params;
    
    if (!nodeId || !chunkId) {
      return res.status(400).json({
        success: false,
        error: 'Node ID and Chunk ID are required'
      });
    }

    // Validate user owns this storage node
    await validateUserOwnsNode(req.user.userId, nodeId);
    
    // Send DELETE_CHUNK command to specific storage node
    const result = await sendStorageNodeCommand(nodeId, {
      command_type: 'DELETE_CHUNK',
      chunk_id: chunkId
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Error deleting chunk:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Catch-all handler for Angular routes (must be after API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/user_interface/browser/index.csr.html'));
});

// WebSocket Helper Functions

async function handleWebSocketText(message, ws) {
  const data = JSON.parse(message);

  switch (data.type) {
    case 'AUTH':
      // Verify the node_id and token against the database
      const node = await StorageNode.findOne({ 
        node_id: data.node_id
      });
      
      if (node && await bcrypt.compare(data.token, node.auth_token)) {
        // Store connection for command routing
        ws.nodeId = data.node_id;
        nodeConnections.set(data.node_id, ws);
        
        // Update node status to online
        try {
          await StorageNode.findOneAndUpdate(
            { node_id: data.node_id },
            { 
              status: 'online',
              last_seen: null
            },
            { new: true }
          );
        } catch (error) {
          console.error(`Error updating node ${data.node_id} status:`, error);
        }
        
        ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', message: 'Authentication successful' }));
        //console.log(`Node ${data.node_id} authenticated successfully`);

        // Update info about node
        updateNodeStatus(data.node_id);
      } else {
        ws.send(JSON.stringify({ type: 'AUTH_FAILED', message: 'Invalid credentials' }));
        console.log(`Authentication failed for node ${data.node_id}`);
      }
      break;
      
    case 'COMMAND_RESULT':
      await handleCommandResult(data, ws);
      break;
      
    case 'STATUS_REPORT':
      // Handle status reports from storage client
      //console.log(`Status report for ${data.command_id}:`, data.status);
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
          // console.log(`Node ${ws.nodeId} storage status updated from status report`);
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
}

async function handleWebSocketBinary(message, ws){
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
    await handleFramedGetChunkResult(data, binaryPayload, ws);
  } else {
    // For other binary message types, just log and ignore for now
    console.warn(`Unknown received binary message of type ${data.type} with command_id ${data.command_id}`);
  }
}

// Handle framed GET_CHUNK_RESULT responses
async function handleFramedGetChunkResult(data, binaryPayload, ws) {
  const { command_id, frame_number, total_frames } = data;
  
  if (!frame_number || !total_frames) {
    // Single frame response
    data.data = binaryPayload;
    delete data.data_size;
    await handleCommandResult(data, ws);
    return;
  }
  
  // Multi-frame response - reconstruct
  const frameKey = command_id;
  
  if (!pendingFrameReconstructions.has(frameKey)) {
    pendingFrameReconstructions.set(frameKey, {
      frames: new Map(),
      total_frames,
      received_count: 0,
      command_data: { ...data }
    });
  }
  
  const reconstruction = pendingFrameReconstructions.get(frameKey);
  
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
    pendingFrameReconstructions.delete(frameKey);
    
    const completeResponse = {
      ...reconstruction.command_data,
      data: fullData
    };
    delete completeResponse.data_size;
    delete completeResponse.frame_number;
    delete completeResponse.total_frames;
    
    // Process the complete response
    await handleCommandResult(completeResponse, ws);
  }
}

async function handleCommandResult(data, ws) {
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
  
  // Store command result for any waiting requests
  if (pendingCommands.has(data.command_id)) {
    const resolve = pendingCommands.get(data.command_id);
    pendingCommands.delete(data.command_id);
    resolve(data);
  }
}

// Store WebSocket connections by node_id for command routing
const nodeConnections = new Map();

// WebSocket server with SSL
const sslOptions = {};
try {
    sslOptions.key = fs.readFileSync(path.join(__dirname, 'ssl', 'origin-key.key'));
    sslOptions.cert = fs.readFileSync(path.join(__dirname, 'ssl', 'origin-cert.pem'));
    sslOptions.ca = fs.readFileSync(path.join(__dirname, 'ssl', 'origin-ca.pem'));
    console.log('SSL certificates loaded successfully.');
} catch (error) {
    console.error('Could not load SSL certificate files', error);
    process.exit(1);
}

const server = https.createServer(sslOptions, app);

// Configure WebSocket server with limits
const wss = new WebSocket.Server({ server: server });

wss.on('connection', (ws) => {
  // console.log('WebSocket client connected');

  ws.on('message', async (message, isBinary) => {
    try {
      if (isBinary) {
        // Handle binary message
        await handleWebSocketBinary(message, ws);
      } else {
        // Handle text message
        await handleWebSocketText(message.toString(), ws);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    // if (ws.isUIClient) {
    //   // UI client disconnecting
    //   if (typeof uiConnections !== 'undefined') {
    //     uiConnections.delete(ws);
    //     console.log(`UI client disconnected. Remaining UI connections: ${uiConnections.size}`);
    //   }
    // } else 
    if (ws.nodeId) {
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
      ).catch((error) => {
        console.error(`Error updating node ${ws.nodeId} status to offline:`, error);
      });
    } else {
      console.log('Unknown client disconnected');
    }
  });
});

server.listen(APP_PORT, '0.0.0.0', () => {
    console.log(`YourCloud Server running on port ${APP_PORT}`);
});