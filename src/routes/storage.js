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
// async function validateUserOwnsNode(req, userId, nodeId) {
//   const user = await User.findById(userId);
//   if (!user || !user.storage_nodes || !user.storage_nodes.includes(nodeId)) {
//     throw new Error('User does not own this storage node');
//   }
  
//   const nodeConnections = getNodeConnections(req);
//   const ws = nodeConnections.get(nodeId);
//   if (!ws || ws.readyState !== 1) {
//     throw new Error(`Storage node ${nodeId} is not connected`);
//   }
  
//   return true;
// }

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
          status: 'online',
          node_id: nodeId,
          used_space: result.status.used_space_bytes || 0,
          total_available_space: result.status.max_space_bytes || 0,
          num_chunks: result.status.current_chunk_count || 0,
          last_seen: null
        };
      }
    } 
    // If not connected or failed to get status, fetch from DB
    const nodeInDb = await StorageNode.findOne({ node_id: nodeId });
    return nodeInDb ? {
      status: 'offline',
      node_id: nodeId,
      used_space: nodeInDb.used_space || 0,
      total_available_space: nodeInDb.total_available_space || 0,
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
    console.error('Error registering node:', error);
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
    }).select('-auth_token'); // Exclude auth_token for security

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

router.post('/turn-credentials', authenticateToken, async (req, res) => {
    const TURN_TOKEN_ID = process.env.CLOUDFLARE_TURN_TOKEN_ID;
    const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

    if (!TURN_TOKEN_ID || !API_TOKEN) {
        return res.status(500).json({ success: false, message: 'TURN service is not configured on the server.' });
    }

    const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_TOKEN_ID}/credentials/generate`;
    
    try {
        const response = await axios.post(
            url,
            { ttl: 3600 },
            {
                headers: {
                    'Authorization': `Bearer ${API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        // The response from Cloudflare already includes the full iceServers array.
        if (response.data && response.data.iceServers) {
            res.status(200).json(response.data);
        } else {
            throw new Error('Invalid response from TURN service');
        }
    } catch (error) {
        console.error('Error fetching TURN credentials:', error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: 'Failed to generate TURN credentials.' });
    }
});

// WebRTC offer relay endpoint
router.post('/signal/offer/:nodeId', authenticateToken, async (req, res) => {
  const { nodeId } = req.params;
  const { offer } = req.body;
  try {
    // Send offer to node and wait for answer
    const result = await sendStorageNodeCommand(req, nodeId, {
      command_type: 'WEB_RTC_OFFER',
      offer
    });
    if (result && result.answer) {
      let answer = result.answer;
      if (typeof answer === 'string') {
        try { answer = JSON.parse(answer); } catch (e) {}
      }
      return res.json({ 
        success: true,
        answer,
        command_id: result.command_id
      });
    } else {
      return res.status(500).json({ 
        success: false,
        message: 'No answer received from node.'
      });
    }
  } catch (error) {
    const statusCode = error.message?.includes('not connected') ? 404 : 504;
    res.status(statusCode).json({
      success: false,
      message: 'Failed to relay offer: ' + error.message
    });
  }
});

// WebRTC ICE candidate relay endpoint
router.post('/signal/ice-candidate/:nodeId', authenticateToken, async (req, res) => {
    const { nodeId } = req.params;
    const { candidate, command_id } = req.body;

    if (!candidate || !command_id) {
        return res.status(400).json({ success: false, message: 'Candidate and command_id are required.' });
    }
    
    try {
        // Fire and forget ICE candidate
        sendStorageNodeCommand(req, nodeId, {
          command_type: 'ICE_CANDIDATE',
          candidate: JSON.stringify(candidate)
        }, command_id );
        return res.json({ success: true, message: 'Candidate relayed.' });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to relay ICE candidate: ' + error.message
      });
    }
});

// Storage Node Status Check
router.get('/node/check-status/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    if (!nodeId) {
      return res.status(400).json({
        success: false,
        error: 'nodeId is required'
      });
    }
    const nodeStatus = await updateNodeStatus(req, nodeId);
    if (!nodeStatus) {
      return res.status(500).json({
        success: false,
        error: `Failed to update status for node ${nodeId}`
      });
    }
    return res.json({
      success: true,
      node_id: nodeId,
      node_status: nodeStatus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check node status: ' + error.message
    });
  }
});

module.exports = {
  router,
  updateNodeStatus,
  sendStorageNodeCommand
};
