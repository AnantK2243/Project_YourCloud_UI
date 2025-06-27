// src/app/routes/storage.js

// Storage and Node management routes
const express = require('express');
const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const bcrypt = require('bcryptjs');
const { authenticateToken } = require('./auth');
const { StorageNode, User } = require('../models/User');
// TODO: IMPLEMENT
const { validateNodeRegistrationInput, validateChunkId } = require('../utils/validation');

const router = express.Router();

const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

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
async function sendStorageNodeCommand(req, nodeId, command, command_id = null, timeout = true) {
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
    if (timeout) {
      setTimeout(() => {
        if (pendingCommands.has(commandId)) {
          pendingCommands.delete(commandId);
          reject(new Error('Command timeout'));
        }
      }, 30000);
    }

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

router.post('/chunks/prepare-upload/:nodeId', authenticateToken, async (req, res) => {
    const { nodeId } = req.params;
    const { data_size } = req.body;

    try {
        await validateUserOwnsNode(req, req.user.userId, nodeId);
        const commandId = generateCommandId(req);

        const chunkIdResponse = await sendStorageNodeCommand(req, nodeId, {
            command_type: 'PREP_UPLOAD',
            data_size,
        }, commandId);

        if (!chunkIdResponse || !chunkIdResponse.success || !chunkIdResponse.chunk_id) {
            throw new Error('Failed to get a valid chunkId from the storage node.');
        }
        const { chunk_id: chunkId } = chunkIdResponse;

        const temporaryObjectName = `temp-${commandId}-${chunkId}`;

        const putCommand = new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: temporaryObjectName });
        const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 300 });

        res.json({
            success: true,
            message: "Ready for upload.",
            chunkId,
            uploadUrl,
            temporaryObjectName
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/chunks/complete-upload/:nodeId', authenticateToken, async (req, res) => {
    const { nodeId } = req.params;
    const { chunkId, temporaryObjectName } = req.body;

    if (!chunkId || !temporaryObjectName) {
        return res.status(400).json({ success: false, message: "chunkId and temporaryObjectName are required."});
    }

    try {
        await validateUserOwnsNode(req, req.user.userId, nodeId);

        const getCommand = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: temporaryObjectName });
        const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 300 });
        
        const storeResult = await sendStorageNodeCommand(req, nodeId, {
            command_type: 'DOWNLOAD_AND_STORE_CHUNK',
            chunk_id: chunkId,
            download_url: downloadUrl
        });

        if (!storeResult || !storeResult.success) {
            throw new Error(storeResult.error || 'Rust client failed to store the chunk.');
        }

        const deleteCommand = new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: temporaryObjectName });
        await s3Client.send(deleteCommand);

        res.json({ success: true, message: "Chunk successfully stored and temporary file cleaned up." });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/chunks/prepare-download/:nodeId/:chunkId', authenticateToken, async (req, res) => {
    const { nodeId, chunkId } = req.params;

    try {
        await validateUserOwnsNode(req, req.user.userId, nodeId);

        const commandId = generateCommandId(req);

        const temporaryObjectName = `temp-${commandId}-${chunkId}`;

        const putCommand = new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: temporaryObjectName });
        const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 300 });

        // Tell the Rust client to fetch the chunk from its disk and upload it to R2.
        const uploadConfirmation = await sendStorageNodeCommand(req, nodeId, {
            command_type: 'RETRIEVE_AND_UPLOAD_CHUNK',
            chunk_id: chunkId,
            upload_url: uploadUrl
        }, commandId, false); // No timeout for this command

        if (!uploadConfirmation || !uploadConfirmation.success) {
            throw new Error(uploadConfirmation.error || 'Rust client failed to upload the chunk.');
        }

        // Once the Rust client confirms the upload, create a pre-signed GET URL for the frontend.
        const getCommand = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: temporaryObjectName });
        const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 300 });

        // Respond to the frontend with the download link.
        res.json({ success: true, downloadUrl });

        setTimeout(async () => {
            try {
                const deleteCommand = new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: temporaryObjectName });
                await s3Client.send(deleteCommand);
                console.log(`Cleaned up temporary download object: ${temporaryObjectName}`);
            } catch (error) {
                console.error(`Failed to cleanup temporary download object ${temporaryObjectName}:`, error);
            }
        }, 10 * 1000 * 1000); // 10 minute cleanup

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = {
  router,
  validateUserOwnsNode,
  updateNodeStatus,
  sendStorageNodeCommand
};