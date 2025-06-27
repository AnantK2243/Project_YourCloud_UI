// src/app/utils/validation.js

// Input validation utilities
const validator = require('validator');

function validateRegistrationInput(data) {
  const errors = [];
  
  if (!data.name || typeof data.name !== 'string') {
    errors.push('Name is required and must be a string');
  } else if (data.name.length < 2 || data.name.length > 50) {
    errors.push('Name must be between 2 and 50 characters');
  } else if (!/^[a-zA-Z\s'-]+$/.test(data.name)) {
    errors.push('Name contains invalid characters');
  }
  
  if (!data.email || typeof data.email !== 'string') {
    errors.push('Email is required and must be a string');
  } else if (!validator.isEmail(data.email)) {
    errors.push('Email format is invalid');
  } else if (data.email.length > 100) {
    errors.push('Email is too long');
  }
  
  if (!data.password || typeof data.password !== 'string') {
    errors.push('Password is required and must be a string');
  } else if (data.password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else if (data.password.length > 128) {
    errors.push('Password is too long');
  } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(data.password)) {
    errors.push('Password must contain at least one lowercase, uppercase, and numeric character');
  }
  
  if (!data.salt || typeof data.salt !== 'string') {
    errors.push('Salt is required and must be a string');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

function validateLoginInput(data) {
  const errors = [];
  
  if (!data.email || typeof data.email !== 'string') {
    errors.push('Email is required and must be a string');
  } else if (!validator.isEmail(data.email)) {
    errors.push('Email format is invalid');
  }
  
  if (!data.password || typeof data.password !== 'string') {
    errors.push('Password is required and must be a string');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

function validateNodeRegistrationInput(data) {
  const errors = [];
  
  if (!data.node_id || typeof data.node_id !== 'string') {
    errors.push('Node ID is required and must be a string');
  } else if (!/^[a-zA-Z0-9-_]+$/.test(data.node_id)) {
    errors.push('Node ID contains invalid characters');
  } else if (data.node_id.length < 3 || data.node_id.length > 50) {
    errors.push('Node ID must be between 3 and 50 characters');
  }
  
  if (!data.label || typeof data.label !== 'string') {
    errors.push('Label is required and must be a string');
  } else if (data.label.length < 1 || data.label.length > 100) {
    errors.push('Label must be between 1 and 100 characters');
  }
  
  if (!data.auth_token || typeof data.auth_token !== 'string') {
    errors.push('Auth token is required and must be a string');
  } else if (data.auth_token.length < 10) {
    errors.push('Auth token is too short');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

function validateChunkId(chunkId) {
  if (!chunkId || typeof chunkId !== 'string') {
    return false;
  }
  
  // UUID v4 pattern
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(chunkId);
}

function sanitizeString(str) {
  if (typeof str !== 'string') {
    return '';
  }
  
  return validator.escape(str);
}

module.exports = {
  validateRegistrationInput,
  validateLoginInput,
  validateNodeRegistrationInput,
  validateChunkId,
  sanitizeString
};
