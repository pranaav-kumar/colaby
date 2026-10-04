const ChatMessage = require('../models/ChatMessage');
const { generateMessageId } = require('../utils/ids');
const { ValidationError } = require('../utils/errors');

/**
 * Saves a new chat message
 */
async function sendMessage(projectId, userId, content) {
  if (!content || typeof content !== 'string' || content.length > 5000) {
    throw new ValidationError('Invalid message content');
  }

  const message = new ChatMessage({
    messageId: generateMessageId(),
    projectId,
    senderId: userId,
    content
  });

  await message.save();
  return message;
}

/**
 * Gets chat history for a project
 */
async function getHistory(projectId, options = {}) {
  const limit = Math.min(parseInt(options.limit, 10) || 50, 100);
  const query = { projectId };
  
  if (options.before) {
    query.createdAt = { $lt: new Date(options.before) };
  }

  return await ChatMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
}

module.exports = {
  sendMessage,
  getHistory
};
