const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  content: { type: String, required: true, maxlength: 5000 },
  createdAt: { type: Date, default: Date.now }
});

chatMessageSchema.index({ projectId: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
