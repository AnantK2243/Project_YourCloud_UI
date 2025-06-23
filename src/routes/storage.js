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

function getPendingFrameReconstructions(req) {
  return getWSManager(req).getPendingFrameReconstructions();
}

// Generate unique command IDs
function generateCommandId() {
  return 'cmd-' + require('crypto').randomBytes(8).toString('hex');
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
    const pendingCommands = getPendingCommands(req);
    const ws = nodeConnections.get(nodeId);
    const isConnected = ws && ws.readyState === 1;
    
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
        last_seen: nodeInDb ? nodeInDb.last_seen : null
      };
    }
  } catch (error) {
    console.error(`Error updating node ${nodeId} status:`, error);
    return null;
  }
}

// Send command to storage node and wait for response
async function sendStorageNodeCommand(req, nodeId, command) {
  return new Promise((resolve, reject) => {
    const nodeConnections = getNodeConnections(req);
    const pendingCommands = getPendingCommands(req);
    const ws = nodeConnections.get(nodeId);
    
    if (!ws || ws.readyState !== 1) {
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
      // Define max chunk size for binary data (32MB)
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
    throw error;
  }
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
    }).select('-auth_token'); // Exclude auth_token for security

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

// Storage Node Status Check
router.post('/check-status', async (req, res) => {
  try {
    const { node_id } = req.body;
    
    if (!node_id) {
      return res.status(400).json({
        success: false,
        error: 'node_id is required'
      });
    }
    
    const nodeStatus = await updateNodeStatus(req, node_id);
    
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

// Storage Node Status Check
router.get('/check-status/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    if (!nodeId) {
      return res.status(400).json({ success: false, error: 'nodeId is required' });
    }
    const nodeStatus = await updateNodeStatus(req, nodeId);
    if (!nodeStatus) {
      return res.status(500).json({ success: false, error: `Failed to update status for node ${nodeId}` });
    }
    return res.json({ success: true, node_id: nodeId, node_status: nodeStatus });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Store chunk endpoint with enhanced security
router.post('/chunks/store/:nodeId/:chunkId', authenticateToken, express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req, res) => {
    try {
      const { nodeId, chunkId } = req.params;
      // Validate parameters
      if (!nodeId || !chunkId) {
        return res.status(400).json({
          success: false,
          error: 'Node ID and Chunk ID are required'
        });
      }
      if (!validateChunkId(chunkId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid chunk ID format'
        });
      }
      // Validate user owns this storage node
      await validateUserOwnsNode(req, req.user.userId, nodeId);
      const chunkData = req.body;
      if (!chunkData || chunkData.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No data provided'
        });
      }
      // Send STORE_CHUNK command with binary data
      const result = await sendStoreCommand(req, nodeId, {
        command_type: 'STORE_CHUNK',
        chunk_id: chunkId,
        data_size: chunkData.length
      }, chunkData);
      res.json({ success: true });
    } catch (error) {
      console.error('Error storing chunk:', error);
      res.status(error.message.includes('does not own') ? 403 : 500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Check/Mark root as initialized
router.get('/node/:nodeId/initialize-root', authenticateToken, async (req, res) => {
  try {
    const { nodeId } = req.params;

    // Validate user owns this storage node
    await validateUserOwnsNode(req, req.user.userId, nodeId);
    
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

// Check chunk availability
router.get('/chunks/chunk-avail/:nodeId/:chunkId', authenticateToken, async (req, res) => {
  try {
    const { nodeId, chunkId } = req.params;

    // Validate user owns this storage node
    await validateUserOwnsNode(req, req.user.userId, nodeId);

    const command = {
      command_type: 'CHECK_CHUNK',
      chunk_id: chunkId
    };

    if (!command.chunk_id) {
      return res.status(400).json({
        success: false,
        error: 'chunk_id query parameter is required'
      });
    }

    const result = await sendStorageNodeCommand(req, nodeId, command);

    res.json({
      success: true,
      chunk_id: command.chunk_id,
      available: !result.chunk_exists
    });

  } catch (error) {
    console.error('Error checking chunk availability:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get chunk endpoint
router.get('/chunks/get/:nodeId/:chunkId', authenticateToken, async (req, res) => {
  try {
    const { nodeId, chunkId } = req.params;
    
    if (!nodeId || !chunkId) {
      return res.status(400).json({
        success: false,
        error: 'Node ID and Chunk ID are required'
      });
    }

    // Validate user owns this storage node
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
router.delete('/chunks/delete/:nodeId/:chunkId', authenticateToken, async (req, res) => {
  try {
    const { nodeId, chunkId } = req.params;
    
    if (!nodeId || !chunkId) {
      return res.status(400).json({
        success: false,
        error: 'Node ID and Chunk ID are required'
      });
    }

    // Validate user owns this storage node
    await validateUserOwnsNode(req, req.user.userId, nodeId);
    
    // Send DELETE_CHUNK command to specific storage node
    const result = await sendStorageNodeCommand(req, nodeId, {
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

module.exports = {
  router,
  validateUserOwnsNode,
  sendStorageNodeCommand,
  sendStoreCommand,
  updateNodeStatus
};
