const mongoose = require('mongoose');

const fileOperationSchema = new mongoose.Schema({
  operationId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['FILE_CREATE', 'FILE_DELETE', 'FILE_RENAME', 'FILE_MOVE', 'FOLDER_CREATE', 'FOLDER_DELETE', 'FOLDER_RENAME', 'FOLDER_MOVE'], 
    required: true 
  },
  nodeId: { type: String, required: true },
  path: String,
  newPath: String,
  parentId: String,
  name: String,
  newName: String,
  nodeType: { type: String, enum: ['file', 'directory'] },
  logicalTimestamp: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

fileOperationSchema.index({ projectId: 1, logicalTimestamp: 1 });

const FileOperation = mongoose.model('FileOperation', fileOperationSchema);

module.exports = FileOperation;
