const mongoose = require('mongoose');

const objectStyleSchema = new mongoose.Schema({
  fill: { type: String, default: 'transparent' },
  stroke: { type: String, default: '#ffffff' },
  strokeWidth: { type: Number, default: 2 },
  fontSize: { type: Number },
  fontFamily: { type: String },
  textContent: { type: String }
}, { _id: false });

const pointSchema = new mongoose.Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true }
}, { _id: false });

const whiteboardObjectSchema = new mongoose.Schema({
  objectId: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['rectangle', 'ellipse', 'line', 'path', 'text', 'arrow', 'image', 'freehand'], 
    required: true 
  },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  rotation: { type: Number, default: 0 },
  points: [pointSchema],
  style: { type: objectStyleSchema, default: () => ({}) },
  createdBy: { type: String },
  version: { type: Number, default: 1 },
  deleted: { type: Boolean, default: false }
}, { timestamps: true, _id: false });

const whiteboardDocumentSchema = new mongoose.Schema({
  projectId: { type: String, required: true, unique: true, index: true },
  objects: [whiteboardObjectSchema],
  version: { type: Number, default: 0 }
}, { timestamps: true });

const WhiteboardDocument = mongoose.model('WhiteboardDocument', whiteboardDocumentSchema);

module.exports = WhiteboardDocument;
