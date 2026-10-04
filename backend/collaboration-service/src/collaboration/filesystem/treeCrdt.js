const { LamportClock } = require('../ordering/logicalClock');
const { ValidationError } = require('../../utils/errors');
const { generateNodeId } = require('../../utils/ids');
const logger = require('../../utils/logger');

class TreeCRDT {
  constructor(projectId) {
    this.projectId = projectId;
    this.nodes = new Map();
    this.clock = new LamportClock();
    this._initRoot();
  }

  _initRoot() {
    this.nodes.set('root', {
      nodeId: 'root',
      parentId: null,
      name: 'root',
      type: 'directory',
      path: '/',
      deleted: false,
      logicalTimestamp: 0,
      metadata: {}
    });
  }

  /**
   * Resolves the full path for a node by walking up to root
   * @param {string} nodeId 
   * @returns {string}
   */
  resolvePath(nodeId) {
    if (nodeId === 'root' || !nodeId) return '/';
    const parts = [];
    let current = this.nodes.get(nodeId);
    let guard = 0;
    while (current && current.nodeId !== 'root' && guard < 100) {
      parts.unshift(current.name);
      current = current.parentId ? this.nodes.get(current.parentId) : null;
      guard++;
    }
    return '/' + parts.join('/');
  }

  /**
   * Helper to find a node by nodeId, path, or filename
   * @param {string} identifier 
   */
  findNode(identifier) {
    if (!identifier) return null;
    if (this.nodes.has(identifier)) {
      const n = this.nodes.get(identifier);
      if (!n.deleted) return n;
    }
    const byPath = this.getNodeByPath(identifier);
    if (byPath) return byPath;

    // Search by name
    for (const node of this.nodes.values()) {
      if (!node.deleted && (node.name === identifier || node.path === identifier)) {
        return node;
      }
    }
    return null;
  }

  /**
   * Creates a new node in the Tree-CRDT
   * @param {string} userId 
   * @param {object} param1 
   */
  createNode(userId, { parentId = 'root', name, type = 'file', nodeId }) {
    let cleanName = (name || '').trim().replace(/^[\/\\]+/, '');
    if (!cleanName) {
      throw new ValidationError('Name is required for file/folder creation');
    }

    // If cleanName has path segments (e.g. "src/components/App.js"), extract file name
    if (cleanName.includes('/') || cleanName.includes('\\')) {
      const segments = cleanName.split(/[\/\\]+/).filter(Boolean);
      cleanName = segments[segments.length - 1];
    }

    // Resolve parent ID
    let targetParentId = parentId || 'root';
    if (targetParentId === '/' || targetParentId === '' || targetParentId === 'root') {
      targetParentId = 'root';
    } else if (!this.nodes.has(targetParentId)) {
      const foundParent = this.findNode(targetParentId);
      if (foundParent && foundParent.type === 'directory') {
        targetParentId = foundParent.nodeId;
      } else {
        targetParentId = 'root';
      }
    }

    const parent = this.nodes.get(targetParentId);
    if (!parent || parent.deleted || parent.type !== 'directory') {
      targetParentId = 'root';
    }

    const id = nodeId || generateNodeId(cleanName, Date.now(), userId);
    if (this.nodes.has(id)) {
      const existing = this.nodes.get(id);
      if (existing.deleted) {
        this.clock.tick();
        existing.deleted = false;
        existing.name = cleanName;
        existing.parentId = targetParentId;
        existing.logicalTimestamp = this.clock.time;
        existing.path = this.resolvePath(id);
        return {
          type: type === 'file' ? 'FILE_CREATE' : 'FOLDER_CREATE',
          node: existing,
          logicalTimestamp: this.clock.time
        };
      }
    }

    // Avoid duplicate sibling names by auto-numbering if needed
    let finalName = cleanName;
    let counter = 1;
    const siblings = Array.from(this.nodes.values()).filter(
      n => n.parentId === targetParentId && !n.deleted && n.nodeId !== id
    );
    while (siblings.some(n => n.name === finalName)) {
      const extMatch = cleanName.match(/(\.[^.]+)$/);
      if (extMatch && type === 'file') {
        const base = cleanName.slice(0, -extMatch[0].length);
        finalName = `${base}(${counter})${extMatch[0]}`;
      } else {
        finalName = `${cleanName}(${counter})`;
      }
      counter++;
    }

    this.clock.tick();
    const node = {
      nodeId: id,
      parentId: targetParentId,
      name: finalName,
      type: type || 'file',
      deleted: false,
      logicalTimestamp: this.clock.time,
      metadata: { createdBy: userId, createdAt: new Date().toISOString() }
    };

    this.nodes.set(id, node);
    node.path = this.resolvePath(id);

    return {
      type: type === 'file' ? 'FILE_CREATE' : 'FOLDER_CREATE',
      node,
      logicalTimestamp: this.clock.time
    };
  }

  /**
   * Soft deletes a node and all of its children (tombstone)
   * @param {string} userId 
   * @param {object} param1 
   */
  deleteNode(userId, { nodeId, path: nodePath, name }) {
    let targetNode = null;
    if (nodeId && this.nodes.has(nodeId)) {
      targetNode = this.nodes.get(nodeId);
    } else if (nodePath) {
      targetNode = this.findNode(nodePath);
    } else if (name) {
      targetNode = this.findNode(name);
    } else if (nodeId) {
      targetNode = this.findNode(nodeId);
    }

    if (!targetNode || targetNode.nodeId === 'root') {
      if (targetNode?.nodeId === 'root') throw new ValidationError('Cannot delete root directory');
      // If already deleted or not found, return clean ack
      return { type: 'FILE_DELETE', nodeId: nodeId || 'unknown', logicalTimestamp: this.clock.time };
    }

    if (targetNode.deleted) {
      return { type: targetNode.type === 'file' ? 'FILE_DELETE' : 'FOLDER_DELETE', nodeId: targetNode.nodeId, logicalTimestamp: this.clock.time };
    }

    this.clock.tick();
    const timestamp = this.clock.time;

    const markDeleted = (id) => {
      const n = this.nodes.get(id);
      if (n && !n.deleted) {
        n.deleted = true;
        n.logicalTimestamp = timestamp;
        for (const child of this.nodes.values()) {
          if (child.parentId === id && !child.deleted) {
            markDeleted(child.nodeId);
          }
        }
      }
    };

    markDeleted(targetNode.nodeId);
    return {
      type: targetNode.type === 'file' ? 'FILE_DELETE' : 'FOLDER_DELETE',
      nodeId: targetNode.nodeId,
      path: targetNode.path,
      logicalTimestamp: timestamp
    };
  }

  /**
   * Moves a node to a new parent
   * @param {string} userId 
   * @param {object} param1 
   */
  moveNode(userId, { nodeId, newParentId, path: nodePath }) {
    const node = this.findNode(nodeId) || (nodePath ? this.findNode(nodePath) : null);
    if (!node || node.nodeId === 'root' || node.deleted) {
      throw new ValidationError('Cannot move root or non-existent node');
    }

    let targetParentId = newParentId || 'root';
    if (targetParentId === '/' || !targetParentId) targetParentId = 'root';
    let newParent = this.nodes.get(targetParentId);
    if (!newParent) {
      newParent = this.findNode(targetParentId);
      if (newParent) targetParentId = newParent.nodeId;
      else targetParentId = 'root';
    }

    if (Array.from(this.nodes.values()).some(
      sibling => sibling.parentId === targetParentId && !sibling.deleted && sibling.nodeId !== node.nodeId && sibling.name === node.name
    )) {
      throw new ValidationError('A file or folder with this name already exists in the destination');
    }

    // Cycle check
    let current = this.nodes.get(targetParentId);
    let guard = 0;
    while (current && current.parentId && guard < 100) {
      if (current.parentId === node.nodeId || current.nodeId === node.nodeId) {
        throw new ValidationError('Cannot move a node into its own descendant directory');
      }
      current = this.nodes.get(current.parentId);
      guard++;
    }

    this.clock.tick();
    node.parentId = targetParentId;
    node.logicalTimestamp = this.clock.time;
    node.path = this.resolvePath(node.nodeId);

    this._refreshDescendantPaths(node.nodeId);

    return {
      type: node.type === 'file' ? 'FILE_MOVE' : 'FOLDER_MOVE',
      nodeId: node.nodeId,
      newParentId: targetParentId,
      path: node.path,
      logicalTimestamp: this.clock.time
    };
  }

  /**
   * Renames a node
   * @param {string} userId 
   * @param {object} param1 
   */
  renameNode(userId, { nodeId, newName, path: nodePath }) {
    const node = this.findNode(nodeId) || (nodePath ? this.findNode(nodePath) : null);
    if (!node || node.nodeId === 'root' || node.deleted) {
      throw new ValidationError('Cannot rename root or non-existent node');
    }

    const cleanName = (newName || '').trim().replace(/^[\/\\]+/, '');
    if (!cleanName) {
      throw new ValidationError('New name is required');
    }

    const siblings = Array.from(this.nodes.values()).filter(
      n => n.parentId === node.parentId && !n.deleted && n.nodeId !== node.nodeId
    );
    if (siblings.some(n => n.name === cleanName)) {
      throw new ValidationError('A file or folder with this name already exists in this directory');
    }

    this.clock.tick();
    node.name = cleanName;
    node.logicalTimestamp = this.clock.time;
    node.path = this.resolvePath(node.nodeId);

    this._refreshDescendantPaths(node.nodeId);

    return {
      type: node.type === 'file' ? 'FILE_RENAME' : 'FOLDER_RENAME',
      nodeId: node.nodeId,
      newName: cleanName,
      path: node.path,
      logicalTimestamp: this.clock.time
    };
  }

  _refreshDescendantPaths(parentId) {
    for (const child of this.nodes.values()) {
      if (child.parentId === parentId && !child.deleted) {
        child.path = this.resolvePath(child.nodeId);
        if (child.type === 'directory') {
          this._refreshDescendantPaths(child.nodeId);
        }
      }
    }
  }

  /**
   * Applies remote operation (from DB replay or WebSocket broadcast)
   * @param {object} operation 
   */
  applyRemoteOperation(operation) {
    if (!operation) return;

    if (operation.logicalTimestamp) {
      this.clock.receive(operation.logicalTimestamp);
    }

    const opType = operation.type || operation.opType;
    const nodeId = operation.nodeId || operation.node?.nodeId || operation.payload?.nodeId || operation.payload?.node?.nodeId;
    const name = operation.name || operation.node?.name || operation.payload?.name || operation.payload?.node?.name;
    const parentId = operation.parentId || operation.node?.parentId || operation.payload?.parentId || operation.payload?.node?.parentId || 'root';
    const type = operation.nodeType || operation.node?.type || operation.payload?.type || operation.payload?.node?.type || (opType?.startsWith('FOLDER') ? 'directory' : 'file');

    if (opType === 'FILE_CREATE' || opType === 'FOLDER_CREATE') {
      if (nodeId && name) {
        this.nodes.set(nodeId, {
          nodeId,
          parentId: parentId || 'root',
          name,
          type: type || 'file',
          deleted: false,
          logicalTimestamp: operation.logicalTimestamp || 0,
          path: this.resolvePath(nodeId),
          metadata: operation.metadata || {}
        });
        this._refreshDescendantPaths(nodeId);
      }
    } else if (opType === 'FILE_DELETE' || opType === 'FOLDER_DELETE') {
      // Primary: tombstone by nodeId
      if (nodeId && this.nodes.has(nodeId)) {
        const node = this.nodes.get(nodeId);
        node.deleted = true;
        // Also tombstone all children recursively
        const markChildrenDeleted = (parentNodeId) => {
          for (const child of this.nodes.values()) {
            if (child.parentId === parentNodeId && !child.deleted) {
              child.deleted = true;
              markChildrenDeleted(child.nodeId);
            }
          }
        };
        markChildrenDeleted(nodeId);
      } else {
        // Fallback: tombstone by path if nodeId lookup failed (old non-deterministic records)
        const opPath = operation.path || operation.node?.path || operation.payload?.path;
        if (opPath) {
          const normalizedOpPath = opPath.replace(/\\/g, '/');
          for (const node of this.nodes.values()) {
            if (!node.deleted) {
              const nodePath = node.path || this.resolvePath(node.nodeId);
              if (nodePath === normalizedOpPath || nodePath === '/' + normalizedOpPath) {
                node.deleted = true;
                // Also tombstone all children recursively
                const markChildrenDeleted = (parentNodeId) => {
                  for (const child of this.nodes.values()) {
                    if (child.parentId === parentNodeId && !child.deleted) {
                      child.deleted = true;
                      markChildrenDeleted(child.nodeId);
                    }
                  }
                };
                markChildrenDeleted(node.nodeId);
                break;
              }
            }
          }
        }
      }
    } else if (opType === 'FILE_RENAME' || opType === 'FOLDER_RENAME') {
      const newName = operation.newName || operation.name || operation.payload?.newName || operation.payload?.name;
      if (nodeId && newName && this.nodes.has(nodeId)) {
        this.nodes.get(nodeId).name = newName;
        this.nodes.get(nodeId).path = this.resolvePath(nodeId);
        this._refreshDescendantPaths(nodeId);
      }
    } else if (opType === 'FILE_MOVE' || opType === 'FOLDER_MOVE') {
      const newParentId = operation.newParentId || operation.parentId || operation.payload?.newParentId || operation.payload?.parentId;
      if (nodeId && newParentId && this.nodes.has(nodeId)) {
        this.nodes.get(nodeId).parentId = newParentId;
        this.nodes.get(nodeId).path = this.resolvePath(nodeId);
        this._refreshDescendantPaths(nodeId);
      }
    }
  }

  /**
   * Returns complete hierarchical tree from root
   */
  getTree() {
    const buildTree = (parentId) => {
      const children = Array.from(this.nodes.values())
        .filter(n => n.parentId === parentId && !n.deleted)
        .sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return (a.name || '').localeCompare(b.name || '');
        })
        .map(n => ({
          ...n,
          path: this.resolvePath(n.nodeId),
          children: n.type === 'directory' ? buildTree(n.nodeId) : undefined
        }));
      return children;
    };

    const rootNode = this.nodes.get('root') || { nodeId: 'root', name: 'root', type: 'directory', path: '/' };
    return {
      ...rootNode,
      path: '/',
      children: buildTree('root')
    };
  }

  getNodeById(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || node.deleted) return null;
    return { ...node, path: this.resolvePath(nodeId) };
  }

  getNodeByPath(pathStr) {
    if (pathStr === '/' || !pathStr || pathStr === 'root') {
      return this.nodes.get('root');
    }
    const cleanPath = pathStr.startsWith('/') ? pathStr : '/' + pathStr;
    const segments = cleanPath.split('/').filter(s => s.length > 0);

    let current = this.nodes.get('root');
    for (const segment of segments) {
      if (!current) return null;
      const children = Array.from(this.nodes.values()).filter(
        n => n.parentId === current.nodeId && !n.deleted
      );
      current = children.find(n => n.name === segment);
      if (!current) return null;
    }
    if (current && !current.deleted) {
      return { ...current, path: this.resolvePath(current.nodeId) };
    }
    return null;
  }

  getAllFiles() {
    return Array.from(this.nodes.values())
      .filter(n => !n.deleted && n.type === 'file')
      .map(n => ({ ...n, path: this.resolvePath(n.nodeId) }));
  }

  serialize() {
    return Array.from(this.nodes.values());
  }

  static deserialize(projectId, data) {
    const tree = new TreeCRDT(projectId);
    if (data && Array.isArray(data)) {
      tree.nodes.clear();
      data.forEach(node => tree.nodes.set(node.nodeId, node));
    }
    return tree;
  }
}

module.exports = TreeCRDT;
