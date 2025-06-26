// Storage and Node management routes
const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticateToken } = require('./auth');
const { StorageNode, User } = require('../models/User');
const { validateNodeRegistrationInput, validateChunkId } = require('../utils/validation');

const router = express.Router();

// Helper functions to get WebSocket manager instances
function getWSManager(req) {
  return req.app.locals.wsManager;
}

function getNodeConnections(req) {
  return getWSManager(req).getNodeConnections();
}

function getPendingCommands(req) {
  return getWSManager(req).getPendingCommands();
}

// Generate unique command IDs
function generateCommandId(req) {
  const id = 'cmd-' + require('crypto').randomBytes(8).toString('hex');
  
  // Ensure uniqueness
  const pendingCommands = getPendingCommands(req);
  if (pendingCommands.has(id)) {
    return generateCommandId(req);
  }

  return id;
}

// Validates user owns the storage node
async function validateUserOwnsNode(req, userId, nodeId) {
  const user = await User.findById(userId);
  if (!user || !user.storage_nodes || !user.storage_nodes.includes(nodeId)) {
    throw new Error('User does not own this storage node');
  }
  
  const nodeConnections = getNodeConnections(req);
  const ws = nodeConnections.get(nodeId);
  if (!ws || ws.readyState !== 1) {
    throw new Error(`Storage node ${nodeId} is not connected`);
  }
  
  return true;
}

// Updates storage node status
async function updateNodeStatus(req, nodeId) {
  try {
    const nodeConnections = getNodeConnections(req);
    const ws = nodeConnections.get(nodeId);
    const isConnected = ws && ws.readyState === 1;
    
    if (isConnected) {
      const result = await sendStorageNodeCommand(req, nodeId, {
        command_type: 'STATUS_REQUEST'
      });

      if (result && result.type === 'STATUS_REPORT' && result.status) {
        return {
          node_id: nodeId,
          status: 'online',
          total_available_space: result.status.max_space_bytes || 0,
          used_space: result.status.used_space_bytes || 0,
          num_chunks: result.status.current_chunk_count || 0,
          last_seen: null
        };
      }
    } 
    // If not connected or failed to get status, fetch from DB
    const nodeInDb = await StorageNode.findOne({ node_id: nodeId });
    return nodeInDb ? {
      node_id: nodeId,
      status: 'offline',
      total_available_space: nodeInDb.total_available_space || 0,
      used_space: nodeInDb.used_space || 0,
      num_chunks: nodeInDb.num_chunks || 0,
      last_seen: nodeInDb.last_seen || null
    } : null;
  } catch (error) {
    console.error(`Error updating node ${nodeId} status:`, error);
    return null;
  }
}

// Send command to storage node and wait for response
async function sendStorageNodeCommand(req, nodeId, command, command_id = null) {
  return new Promise((resolve, reject) => {
    const nodeConnections = getNodeConnections(req);
    const pendingCommands = getPendingCommands(req);
    const ws = nodeConnections.get(nodeId);
    
    if (!ws || ws.readyState !== 1) {
      reject(new Error(`Storage node ${nodeId} is not connected`));
      return;
    }

    const commandId = command_id || generateCommandId(req);
    const fullCommand = {
      ...command,
      command_id: commandId
    };

    // Set up response handler
    pendingCommands.set(commandId, (result) => {
      resolve(result);
    });

    // Set timeout (30 seconds)
    setTimeout(() => {
      if (pendingCommands.has(commandId)) {
        pendingCommands.delete(commandId);
        reject(new Error('Command timeout'));
      }
    }, 30000);

    try {
      ws.send(JSON.stringify(fullCommand));
    } catch (error) {
      pendingCommands.delete(commandId);
      reject(error);
    }
  });
}

// Send store command with data
async function sendStoreCommand(req, nodeId, command, binaryData) {
  return new Promise(async (resolve, reject) => {
    const nodeConnections = getNodeConnections(req);
    const pendingCommands = getPendingCommands(req);
    const ws = nodeConnections.get(nodeId);

    if (!ws || ws.readyState !== 1) {
      reject(new Error(`Storage node ${nodeId} is not connected`));
      return;
    }

    const commandId = generateCommandId(req);
    const fullCommand = {
      ...command,
      command_id: commandId
    };

    // Set up response handler
    pendingCommands.set(commandId, (result) => {
      resolve(result);
    });

    // Set timeout (30 seconds)
    const timeout = setTimeout(() => {
      if (pendingCommands.has(commandId)) {
        pendingCommands.delete(commandId);
        reject(new Error('Command timeout'));
      }
    }, 30000);

    try {
      // Create combined binary message: [4 bytes: json_length][json][binary_data]
      const jsonString = JSON.stringify(fullCommand);
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
      clearTimeout(timeout);
      reject(error);
    }
  });
}

// Register a new storage node
router.post('/register-node', authenticateToken, async (req, res) => {
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
      node_name: node_name,
      node_id,
      auth_token: hashedAuthToken,
      status: 'offline',
      total_available_space: -1,
      used_space: 0,
      num_chunks: 0,
      last_seen: null,
      owner_user_id: req.user.userId // Associate node with the user
    });

    await node.save();

    // Set timeout to delete node if it doesn't connect
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
    }, 5 * 60 * 1000); // 5 minutes

    // Add the node_id to the user's storage_nodes array
    await User.findByIdAndUpdate(
      req.user.userId,
      { $addToSet: { storage_nodes: node_id } },
      { new: true }
    );

    res.json({
      success: true,
      node_id,
      auth_token,
      node_name: node_name.trim(),
      message: 'Node registered successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to register node: " + error.message
    });
  }
});

// Get user's storage nodes from database
router.get('/user/storage-nodes', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get detailed information about each storage node
    const storageNodes = await StorageNode.find({
      node_id: { $in: user.storage_nodes }
    }).select('-auth_token').select('-owner_user_id'); // Exclude auth_token and owner_user_id for security

    res.json({
      success: true,
      storage_nodes: storageNodes
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch storage nodes: ' + error.message
    });
  }
});

// Storage Node Status Check
router.get('/node/check-status/:nodeId', authenticateToken, async (req, res) => {
  try {
    const { nodeId } = req.params;
    if (!nodeId) {
      throw new Error('nodeId is required');
    }
    const nodeStatus = await updateNodeStatus(req, nodeId);
    if (!nodeStatus) {
      throw new Error(`Failed to update status for node ${nodeId}`);
    }
    res.json({
      success: true,
      node_status: nodeStatus
    });
  } catch (error) {
    if (error.message.includes('required')) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    } else if (error.message.includes('Failed to update status')) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to check node status: ' + error.message
      });
    }
  }
});

// Delete Storage Node
router.delete('/node/delete-node/:nodeId', authenticateToken, async (req, res) => {
  try {
    const { nodeId } = req.params;
    if (!nodeId) {
      throw new Error('nodeId is required');
    }

    // Find the node in the database
    const node = await StorageNode.findOne({ node_id: nodeId });
    if (!node) {
      return res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }

    // Delete the node
    await StorageNode.deleteOne({ node_id: nodeId });

    // Remove node_id from user's storage_nodes array
    await User.findByIdAndUpdate(
      req.user.userId,
      { $pull: { storage_nodes: nodeId } }
    );

    res.json({
      success: true,
      message: 'Node deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete node: ' + error.message
    });
  }
});

// Store chunk
router.post('/chunks/store/:nodeId/:chunkId', authenticateToken, express.raw({ type: 'application/octet-stream', limit: '64mb' }), async (req, res) => {
  try {
    const { nodeId, chunkId } = req.params;
    if (!nodeId || !chunkId) {
      throw new Error('Node ID and Chunk ID are required');
    }

    await validateUserOwnsNode(req, req.user.userId, nodeId);

    const chunkData = req.body;
    if (!chunkData || chunkData.length === 0) {
      throw new Error('No data provided');
    }

    // Send STORE_CHUNK command with binary data
    const result = await sendStoreCommand(req, nodeId, {
      command_type: 'STORE_CHUNK',
      chunk_id: chunkId,
      data_size: chunkData.length
    }, chunkData);

    if (result.success && result.chunk_id) {
      res.json({ success: true, chunk_id: result.chunk_id });
    } else {
      throw new Error(result.error || 'Failed to store chunk');
    }
  } catch (error) {
    if (error.message.includes('required')) {
      res.status(400).json({
        success: false,
        error: error.message
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
    } else if (error.message.includes('Chunk ID already exists')) {
      res.status(409).json({
        success: false,
        error: 'Chunk ID already exists'
      });
    } else if (error.message.includes('Insufficient disk space.')) {
      res.status(507).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }
});

// Get chunk endpoint
router.get('/chunks/get/:nodeId/:chunkId', authenticateToken, async (req, res) => {
  try {
    const { nodeId, chunkId } = req.params;
    if (!nodeId || !chunkId) {
      throw new Error('Node ID and Chunk ID are required');
    }

    await validateUserOwnsNode(req, req.user.userId, nodeId);

    // Send GET_CHUNK command
    const result = await sendStorageNodeCommand(req, nodeId, {
      command_type: 'GET_CHUNK',
      chunk_id: chunkId
    });

    if (result.success && result.data) {
      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-Length', result.data.length.toString());
      res.send(result.data);
    } else {
      throw new Error(result.error || 'Chunk not found');
    }
  } catch (error) {
    if (error.message.includes('required')) {
      res.status(400).json({
        success: false,
        error: error.message
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
    } else if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }
});

// Delete chunk endpoint
router.delete('/chunks/delete/:nodeId/:chunkId', authenticateToken, async (req, res) => {
  try {
    const { nodeId, chunkId } = req.params;
    if (!nodeId || !chunkId) {
      throw new Error('Node ID and Chunk ID are required');
    }

    await validateUserOwnsNode(req, req.user.userId, nodeId);

    // Send DELETE_CHUNK command to specific storage node
    const result = await sendStorageNodeCommand(req, nodeId, {
      command_type: 'DELETE_CHUNK',
      chunk_id: chunkId
    });

    if (result.success) {
      res.json({ success: true, message: 'Chunk deleted successfully' });
    } else {
      throw new Error(result.error || 'Failed to delete chunk');
    }
  } catch (error) {
    if (error.message.includes('required')) {
      res.status(400).json({
        success: false,
        error: error.message
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
    } else if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }
});

module.exports = {
  router,
  validateUserOwnsNode,
  updateNodeStatus,
  sendStorageNodeCommand
};