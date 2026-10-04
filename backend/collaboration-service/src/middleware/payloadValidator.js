/**
 * Payload validation middleware for REST endpoints
 */

/**
 * Validate chat message POST body
 */
const validateChatPayload = (req, res, next) => {
  const { content } = req.body;
  
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'Content must be a string' });
  }

  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > 5000) {
    return res.status(400).json({ error: 'Content must be between 1 and 5000 characters' });
  }

  req.body.content = trimmed;
  next();
};

/**
 * Validate projectId param format (UUID regex or similar)
 */
const validateWorkspaceParams = (req, res, next) => {
  const { projectId } = req.params;
  
  // Basic validation for string type and not empty
  if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
    return res.status(400).json({ error: 'Invalid projectId' });
  }

  // Assuming UUID format or similar alphanumeric format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const alphanumericRegex = /^[a-zA-Z0-9_-]+$/;
  
  if (!uuidRegex.test(projectId) && !alphanumericRegex.test(projectId)) {
    return res.status(400).json({ error: 'Invalid projectId format' });
  }

  next();
};

/**
 * Sanitize string: strip null bytes, trim, limit length
 */
const sanitizeString = (str, maxLength = 255) => {
  if (typeof str !== 'string') return '';
  // Remove null bytes
  let sanitized = str.replace(/\0/g, '').trim();
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  return sanitized;
};

/**
 * Validate query params for pagination
 */
const validatePagination = (req, res, next) => {
  let { limit, before } = req.query;

  if (limit) {
    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      req.query.limit = 50; // default
    } else {
      req.query.limit = parsedLimit;
    }
  } else {
    req.query.limit = 50;
  }

  if (before) {
    // Validate date string or timestamp
    const date = new Date(before);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid before timestamp' });
    }
  }

  next();
};

module.exports = {
  validateChatPayload,
  validateWorkspaceParams,
  sanitizeString,
  validatePagination
};
