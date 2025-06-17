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
const BACKEND_PORT = process.env.BACKEND_PORT;
const FRONTEND_PORT = process.env.FRONTEND_PORT;
const WS_PORT = process.env.WS_PORT;

// Configure CORS based on environment
const allowedOrigins = [
  'http://localhost:4200', 
  'https://localhost:4200', 
  'http://localhost:3000', 
  'https://localhost:3000',
  `http://localhost:${FRONTEND_PORT}`,
  `https://localhost:${FRONTEND_PORT}`,
  `http://localhost:${BACKEND_PORT}`,
  `https://localhost:${BACKEND_PORT}`
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Connection']
}));
app.use(express.json());

// Serve static files from Angular build
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
  owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
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

// User Schema for authentication
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  storage_nodes: [{ type: String }],
  created_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// Storage for pending commands awaiting responses
const pendingCommands = new Map();

// Generate unique command IDs
function generateCommandId() {
  return 'cmd-' + require('crypto').randomBytes(8).toString('hex');
}

// Optimized helper function to update node storage status (WebSocket-first, no DB lookup)
async function updateNodeStatus(nodeId) {
  try {
    // Check if node is connected via WebSocket first (instant)
    const ws = nodeConnections.get(nodeId);
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    
    if (isConnected) {
      // Node is online - request fresh status and update DB in background
      const statusCommand = {
        command_type: 'STATUS_REQUEST',
        command_id: generateCommandId()
      };

      // Send status request and handle response in background
      pendingCommands.set(statusCommand.command_id, (result) => {
        if (result.type === 'STATUS_REPORT' && result.status) {
          // Update database in background with fresh data
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
          // Still update DB to mark as online even if status request failed
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
          // Update DB to mark as online even on timeout
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

// Routes

// Health check endpoint for testing connectivity
app.get('/api/health-check', (req, res) => {
  const status = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    version: '1.0.0'
  };
  res.json(status);
});

// Simple health endpoint (for load balancers)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

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
const cleanupInterval = 60 * 60 * 1000;
setInterval(cleanupExpiredTokens, cleanupInterval);
console.log(`Token blacklist cleanup job scheduled to run every ${cleanupInterval / (60 * 1000)} minutes.`);

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
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
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
      password: hashedPassword
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
        email: user.email
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
      status: 'offline', // Set to offline initially, will be online when WebSocket connects
      total_available_space: -1,
      used_space: 0,
      num_chunks: 0,
      last_seen: new Date(),
      label: node_name,
      owner_user_id: req.user.userId // Associate node with the user
    });

    await node.save();

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

// Store WebSocket connections by node_id for command routing
const nodeConnections = new Map();

// WebSocket server with SSL
let sslOptions = {};
try {
  sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'ssl', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl', 'cert.pem'))
  };
  // console.log('SSL certificates loaded');
} catch (error) {
  console.error('SSL certificates not found');
  process.exit(1);
}

const httpsServerForWS = https.createServer(sslOptions);
const wss = new WebSocket.Server({ server: httpsServerForWS });

wss.on('connection', (ws) => {
  // console.log('WebSocket client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      // console.log('Received WebSocket message:', data);

      // Handle different message types
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
                  last_seen: null,
                },
                { new: true }
              );
              // console.log(`Node ${data.node_id} status updated to online`);
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

// Start HTTP server
const http = require('http');

// Catch-all handler for Angular routes (must be after API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/user_interface/browser/index.csr.html'));
});

const httpServer = http.createServer(app);
httpServer.listen(BACKEND_PORT, '0.0.0.0', () => {
  console.log(`HTTP Backend server running on 0.0.0.0:${BACKEND_PORT}`);
  console.log(`MongoDB Atlas connection status: ${mongoose.connection.readyState === 1 ? 'connected' : 'connecting...'}`);
});

// Start HTTPS server for frontend
if (process.env.NODE_ENV === 'production') {
  const httpsServer = https.createServer(sslOptions, app);
  httpsServer.listen(FRONTEND_PORT, '0.0.0.0', () => {
    console.log(`HTTPS Frontend server (Angular + API) running on 0.0.0.0:${FRONTEND_PORT}`);
  });
} else {
  console.log(`Frontend server disabled - using Angular dev server on port ${FRONTEND_PORT}`);
}

// Start the secure WebSocket server
httpsServerForWS.listen(WS_PORT, () => {
  console.log(`Secure WebSocket server (WSS) running on port ${WS_PORT}`);
});