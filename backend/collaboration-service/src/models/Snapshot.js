const mongoose = require('mongoose');

const snapshotSchema = new mongoose.Schema({
  snapshotId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  type: { type: String, enum: ['WHITEBOARD', 'FILE_TREE', 'CODE_DOCUMENT', 'FULL'], required: true },
  state: { type: mongoose.Schema.Types.Mixed, required: true },
  version: { type: Number, required: true },
  metadata: {
    fileCount: Number,
    objectCount: Number,
    filePath: String
  },
  createdAt: { type: Date, default: Date.now }
});

snapshotSchema.index({ projectId: 1, type: 1, version: -1 });
// TTL index: cleanup old snapshots after 30 days
snapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Snapshot = mongoose.model('Snapshot', snapshotSchema);

module.exports = Snapshot;
