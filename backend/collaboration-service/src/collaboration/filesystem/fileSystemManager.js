const fs = require('fs');
const path = require('path');
const TreeCRDT = require('./treeCrdt');
const FileOperation = require('../../models/FileOperation');
const { sanitizePath, isWithinWorkspace } = require('../../utils/pathSecurity');
const { WORKSPACE_ROOT_DIR } = require('../../config/env');
const { generateNodeId, generateDeterministicNodeId } = require('../../utils/ids');
const logger = require('../../utils/logger');
const Workspace = require('../../models/Workspace');

class FileSystemManager {
  constructor() {
    /** @type {Map<string, TreeCRDT>} */
    this.trees = new Map();

    /**
     * Promise cache so concurrent getOrCreateTree calls for the same projectId
     * don't race and trigger multiple disk scans / DB writes.
     * @type {Map<string, Promise<TreeCRDT>>}
     */
    this._building = new Map();
  }

  /**
   * Gets or creates a TreeCRDT instance.
   *
   * Replay strategy (NO duplicate DB writes):
   *   1. Replay all FileOperation docs from MongoDB in logicalTimestamp order.
   *   2. Build `deletedPaths` + `deletedNodeIds` sets from DELETE ops.
   *   3. If tree is still empty after replay (no DB records at all), auto-scan
   *      disk into the in-memory tree — WITHOUT writing anything to DB.
   *      (DB gets written the first time via handleFileOperation; on clone via loadFromDisk+persistToDb=true)
   *   4. Post-scan: re-tombstone any node whose nodeId or path appears in the deleted sets.
   *
   * @param {string} projectId
   * @returns {Promise<TreeCRDT>}
   */
  async getOrCreateTree(projectId) {
    if (this.trees.has(projectId)) {
      return this.trees.get(projectId);
    }

    // Promise-lock: prevent concurrent builds for the same project
    if (this._building.has(projectId)) {
      return this._building.get(projectId);
    }

    const buildPromise = this._buildTree(projectId);
    this._building.set(projectId, buildPromise);

    try {
      const tree = await buildPromise;
      this.trees.set(projectId, tree);
      return tree;
    } finally {
      this._building.delete(projectId);
    }
  }

  /** @private */
  async _buildTree(projectId) {
    const tree = new TreeCRDT(projectId);

    let deletedPaths = new Set();
    let deletedNodeIds = new Set();
    let hadDbOps = false;

    // 1. Replay operations from DB
    try {
      const ops = await FileOperation.find({ projectId }).sort({ logicalTimestamp: 1 });
      hadDbOps = ops.length > 0;

      // First pass: collect deleted paths/nodeIds
      for (const op of ops) {
        if (op.type === 'FILE_DELETE' || op.type === 'FOLDER_DELETE') {
          if (op.path) deletedPaths.add(op.path.replace(/\\/g, '/').toLowerCase());
          if (op.nodeId) deletedNodeIds.add(op.nodeId);
        }
      }

      // Second pass: replay all ops into the tree
      for (const op of ops) {
        tree.applyRemoteOperation(op);
      }
    } catch (err) {
      logger.warn(`Could not replay file ops for ${projectId}:`, err.message);
    }

    // 2. If no DB records at all, auto-scan from disk (in-memory ONLY, no DB write)
    if (!hadDbOps) {
      try {
        const workspace = await Workspace.findOne({ projectId });
        if (workspace && workspace.repoPath && fs.existsSync(workspace.repoPath)) {
          const files = fs.readdirSync(workspace.repoPath);
          if (files.length > 0) {
            // persistToDb = false: just populate in-memory, don't write extra DB records
            await this._scanDiskIntoTree(tree, projectId, workspace.repoPath, 'system', deletedPaths, false);
          }
        }
      } catch (err) {
        logger.warn(`Auto disk scan check for ${projectId}:`, err.message);
      }
    }

    // 3. Post-scan: tombstone any node matching a deleted nodeId or path
    //    This handles edge cases where disk-scan added a node that was previously deleted
    for (const [nodeId, node] of tree.nodes.entries()) {
      if (nodeId === 'root') continue;
      const nodePath = (node.path || tree.resolvePath(nodeId) || '').replace(/\\/g, '/').toLowerCase();
      if (
        deletedNodeIds.has(nodeId) ||
        (nodePath && nodePath !== '/' && (deletedPaths.has(nodePath) || deletedPaths.has(nodePath.replace(/^\//, ''))))
      ) {
        node.deleted = true;
        // Cascade to children
        for (const child of tree.nodes.values()) {
          if (child.parentId === nodeId && !child.deleted) {
            child.deleted = true;
          }
        }
      }
    }

    return tree;
  }

  /**
   * Handles a file operation
   * @param {string} projectId 
   * @param {string} userId 
   * @param {object} operation 
   */
  async handleFileOperation(projectId, userId, operation) {
    const tree = await this.getOrCreateTree(projectId);
    let resultOp;

    const opType = (operation.type || operation.opType || '').toUpperCase();
    const payload = operation.payload || operation;
    const name = payload.name || payload.fileName || payload.folderName;
    const nodeId = payload.nodeId || payload.id;
    const parentId = payload.parentId || payload.targetParentId || 'root';
    const newName = payload.newName || payload.name;
    const newParentId = payload.newParentId || payload.parentId;
    const filePath = payload.path || payload.filePath;
    const existingNode = tree.findNode(nodeId || filePath || name);
    const previousPath = existingNode?.path || (existingNode ? tree.resolvePath(existingNode.nodeId) : null);

    switch (opType) {
      case 'CREATE':
      case 'FILE_CREATE':
      case 'FOLDER_CREATE': {
        const itemType = payload.type || (opType === 'FOLDER_CREATE' ? 'directory' : 'file');
        resultOp = tree.createNode(userId, {
          parentId,
          name: name || (itemType === 'directory' ? 'new_folder' : 'new_file.txt'),
          type: itemType,
          nodeId
        });
        break;
      }
      case 'DELETE':
      case 'FILE_DELETE':
      case 'FOLDER_DELETE': {
        resultOp = tree.deleteNode(userId, {
          nodeId,
          path: filePath,
          name
        });
        break;
      }
      case 'MOVE':
      case 'FILE_MOVE':
      case 'FOLDER_MOVE': {
        resultOp = tree.moveNode(userId, {
          nodeId,
          newParentId,
          path: filePath
        });
        break;
      }
      case 'RENAME':
      case 'FILE_RENAME':
      case 'FOLDER_RENAME': {
        resultOp = tree.renameNode(userId, {
          nodeId,
          newName,
          path: filePath
        });
        break;
      }
      default:
        throw new Error(`Unknown file operation: ${opType}`);
    }

    if (['FILE_RENAME', 'FOLDER_RENAME', 'FILE_MOVE', 'FOLDER_MOVE'].includes(resultOp.type)) {
      resultOp.previousPath = previousPath;
    }

    // Persist operation to MongoDB
    try {
      const dbOp = new FileOperation({
        operationId: `${projectId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        projectId,
        userId,
        type: resultOp.type,
        nodeId: resultOp.nodeId || resultOp.node?.nodeId,
        logicalTimestamp: resultOp.logicalTimestamp,
        name: name || resultOp.node?.name,
        newName: newName || resultOp.newName,
        parentId: parentId || resultOp.node?.parentId,
        newParentId: newParentId || resultOp.newParentId,
        path: resultOp.path || resultOp.node?.path,
        nodeType: payload.type || resultOp.node?.type || (resultOp.type?.startsWith('FILE') ? 'file' : 'directory')
      });
      await dbOp.save();
    } catch (dbErr) {
      logger.warn(`Could not persist file op to DB:`, dbErr.message);
    }

    // Complete the disk operation before acknowledging/broadcasting it.
    await this.syncToDisk(projectId, resultOp, tree);

    return resultOp;
  }

  /**
   * Syncs operation to disk
   * @param {string} projectId 
   * @param {object} operation 
   * @param {TreeCRDT} tree
   */
  async syncToDisk(projectId, operation, tree) {
    try {
      const workspace = await Workspace.findOne({ projectId });
      const workspaceRoot = path.resolve(
        workspace?.repoPath || path.join(WORKSPACE_ROOT_DIR, projectId)
      );
      if (!fs.existsSync(workspaceRoot)) {
        fs.mkdirSync(workspaceRoot, { recursive: true });
      }

      if (operation.type === 'FILE_CREATE') {
        const filePath = operation.node?.path || tree.resolvePath(operation.node?.nodeId);
        if (filePath && filePath !== '/') {
          const diskPath = sanitizePath(filePath, workspaceRoot);
          const dir = path.dirname(diskPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          if (!fs.existsSync(diskPath)) fs.writeFileSync(diskPath, '', 'utf8');
        }
      } else if (operation.type === 'FOLDER_CREATE') {
        const folderPath = operation.node?.path || tree.resolvePath(operation.node?.nodeId);
        if (folderPath && folderPath !== '/') {
          const diskPath = sanitizePath(folderPath, workspaceRoot);
          if (!fs.existsSync(diskPath)) fs.mkdirSync(diskPath, { recursive: true });
        }
      } else if (operation.type === 'FILE_DELETE' || operation.type === 'FOLDER_DELETE') {
        const targetPath = operation.path || tree.resolvePath(operation.nodeId);
        if (targetPath && targetPath !== '/') {
          const diskPath = sanitizePath(targetPath, workspaceRoot);
          if (fs.existsSync(diskPath)) {
            try {
              if (fs.statSync(diskPath).isDirectory()) {
                fs.rmSync(diskPath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(diskPath);
              }
            } catch (error) {
              throw error;
            }
          }
        }
      } else if (operation.type === 'FILE_RENAME' || operation.type === 'FOLDER_RENAME' ||
                 operation.type === 'FILE_MOVE' || operation.type === 'FOLDER_MOVE') {
        const oldPath = operation.previousPath;
        const newPath = operation.path || tree.resolvePath(operation.nodeId);
        if (oldPath && newPath && oldPath !== newPath) {
          const sourcePath = sanitizePath(oldPath, workspaceRoot);
          const targetPath = sanitizePath(newPath, workspaceRoot);
          if (!fs.existsSync(sourcePath)) {
            throw new Error(`Cannot move missing workspace item: ${oldPath}`);
          }
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.renameSync(sourcePath, targetPath);
        }
      }
    } catch (error) {
      logger.warn(`Could not sync to disk for project ${projectId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Returns current tree state
   * @param {string} projectId 
   */
  async getFileTree(projectId) {
    const tree = await this.getOrCreateTree(projectId);
    return tree.getTree();
  }

  /**
   * Public: Recursively scans disk and populates TreeCRDT + persists to DB.
   * Called explicitly by cloneRepository (persistToDb = true).
   *
   * @param {string} projectId 
   * @param {string} workspacePath 
   * @param {string} userId
   * @param {TreeCRDT} [existingTree]
   * @param {Set<string>} [deletedPaths]
   */
  async loadFromDisk(projectId, workspacePath, userId = 'system', existingTree = null, deletedPaths = new Set()) {
    const tree = existingTree || await this.getOrCreateTree(projectId);
    // Called explicitly (e.g. from cloneRepository) → always persist to DB
    await this._scanDiskIntoTree(tree, projectId, workspacePath, userId, deletedPaths, true);
    return tree;
  }

  /**
   * @private
   * Core disk scanner. persistToDb controls whether FILE_CREATE ops are written to MongoDB.
   * - persistToDb=true  : called from cloneRepository / explicit init
   * - persistToDb=false : called from auto-scan fallback in getOrCreateTree (server startup only)
   *
   * @param {TreeCRDT} tree
   * @param {string} projectId
   * @param {string} workspacePath
   * @param {string} userId
   * @param {Set<string>} deletedPaths
   * @param {boolean} persistToDb
   */
  async _scanDiskIntoTree(tree, projectId, workspacePath, userId, deletedPaths, persistToDb) {
    const scanDir = async (dirPath, parentNodeId, parentRelPath) => {
      if (!fs.existsSync(dirPath)) return;
      let entries = [];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch (_) {
        return;
      }

      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.DS_Store' || entry.name === '.idea') {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const isDir = entry.isDirectory();
        const relPath = parentRelPath ? `${parentRelPath}/${entry.name}` : entry.name;
        const normalizedRelPath = relPath.replace(/\\/g, '/').toLowerCase();

        // Skip entries that were deleted
        if (deletedPaths.has('/' + normalizedRelPath) || deletedPaths.has(normalizedRelPath)) {
          continue;
        }

        // Deterministic nodeId: same path → same nodeId every restart
        const nodeId = generateDeterministicNodeId(relPath);

        try {
          // If already in tree (from DB replay), just recurse directories — don't duplicate
          if (tree.nodes.has(nodeId) && !tree.nodes.get(nodeId).deleted) {
            if (isDir) {
              await scanDir(fullPath, nodeId, relPath);
            }
            continue;
          }

          const op = tree.createNode(userId, {
            parentId: parentNodeId,
            name: entry.name,
            type: isDir ? 'directory' : 'file',
            nodeId
          });

          // Only write to DB when explicitly requested (clone / explicit init, NOT auto-scan)
          if (persistToDb) {
            try {
              await FileOperation.create({
                operationId: `${projectId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                projectId,
                userId,
                type: isDir ? 'FOLDER_CREATE' : 'FILE_CREATE',
                nodeId: op.node.nodeId,
                logicalTimestamp: op.logicalTimestamp,
                name: entry.name,
                parentId: parentNodeId,
                path: op.node.path,
                nodeType: isDir ? 'directory' : 'file'
              });
            } catch (_) {}
          }

          if (isDir) {
            await scanDir(fullPath, op.node.nodeId, relPath);
          }
        } catch (err) {
          logger.warn(`Error indexing ${entry.name}:`, err.message);
        }
      }
    };

    await scanDir(workspacePath, 'root', '');
  }

  /**
   * Cleans up in-memory tree for a project
   * @param {string} projectId 
   */
  cleanup(projectId) {
    this.trees.delete(projectId);
    this._building.delete(projectId);
  }
}

module.exports = new FileSystemManager();
