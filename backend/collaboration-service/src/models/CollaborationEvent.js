const mongoose = require('mongoose');

const collaborationEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  type: { type: String, required: true, index: true },
  operationId: String,
  logicalTimestamp: { type: Number, required: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

collaborationEventSchema.index({ projectId: 1, logicalTimestamp: 1 });
collaborationEventSchema.index({ projectId: 1, createdAt: -1 });

const CollaborationEvent = mongoose.model('CollaborationEvent', collaborationEventSchema);

module.exports = CollaborationEvent;
