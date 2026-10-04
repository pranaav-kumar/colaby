const mongoose = require('mongoose');

const codeDocumentSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },
  fileId: { type: String, index: true },
  filePath: { type: String, required: true },
  content: { type: String, default: '' },
  yjsStateVector: { type: Buffer },
  yjsUpdate: { type: Buffer },
  version: { type: Number, default: 0 },
  lastEditedBy: { type: String },
  updatedAt: { type: Date, default: Date.now }
});

codeDocumentSchema.index({ projectId: 1, filePath: 1 }, { unique: true });
codeDocumentSchema.index({ projectId: 1, fileId: 1 });

const CodeDocument = mongoose.model('CodeDocument', codeDocumentSchema);

module.exports = CodeDocument;

