const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
  projectId: { type: String, required: true, unique: true, index: true },
  sourceType: { type: String, enum: ['GITHUB', 'SCRATCH'], default: 'SCRATCH' },
  repositoryUrl: { type: String, default: null },
  initialized: { type: Boolean, default: false },
  repoCloned: { type: Boolean, default: false },
  repoPath: { type: String, default: null },
  rootNodeId: { type: String, default: 'root' },
  status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  version: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Workspace', workspaceSchema);

