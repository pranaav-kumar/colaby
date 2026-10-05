const fs = require('fs');
const path = require('path');
const { ValidationError } = require('./errors');

/**
 * Normalizes a path, resolving ., .., and standardizing separators
 * @param {string} inputPath 
 * @returns {string}
 */
function normalizePath(inputPath) {
  if (typeof inputPath !== 'string') throw new ValidationError('Path must be a string');
  return path.normalize(inputPath.trim()).replace(/\\/g, '/');
}

/**
 * Checks if filePath is within workspaceRoot
 * @param {string} filePath 
 * @param {string} workspaceRoot 
 * @returns {boolean}
 */
function isWithinWorkspace(filePath, workspaceRoot) {
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(workspaceRoot);
  const relative = path.relative(resolvedRoot, resolvedPath);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * Validates a file or directory name
 * @param {string} name 
 */
function validateFileName(name) {
  if (!name || typeof name !== 'string') throw new ValidationError('Name is required');
  if (name.length === 0 || name.length > 255) throw new ValidationError('Name length must be between 1 and 255');
  if (name.includes('/') || name.includes('\\')) throw new ValidationError('Name cannot contain path separators');
  if (name.includes('\0')) throw new ValidationError('Name cannot contain null bytes');
  if (name.startsWith('..')) throw new ValidationError('Name cannot start with ..');
  
  // Windows reserved names
  const reservedRegex = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedRegex.test(name)) throw new ValidationError('Reserved file name');
  
  return true;
}

/**
 * Validates a path for traversal and other issues
 * @param {string} filePath 
 */
function validatePath(filePath) {
  const normalized = normalizePath(filePath);
  if (normalized.includes('\0') || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new ValidationError('Path traversal not allowed');
  }
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    throw new ValidationError('URLs not allowed in paths');
  }
  return normalized;
}

/**
 * Sanitizes a path and ensures it's within the workspace
 * @param {string} filePath 
 * @param {string} workspaceRoot 
 */
function sanitizePath(filePath, workspaceRoot) {
  const validPath = validatePath(filePath);
  const cleanRelative = validPath.replace(/^[/\\]+/, '');
  const resolvedRoot = path.resolve(workspaceRoot);
  fs.mkdirSync(resolvedRoot, { recursive: true });
  const realRoot = fs.realpathSync(resolvedRoot);
  const diskPath = path.resolve(realRoot, cleanRelative);
  if (!isWithinWorkspace(diskPath, realRoot)) {
    throw new ValidationError('Path is outside workspace');
  }

  // Existing symlink components are allowed only when their real targets stay
  // inside the workspace. For a new file, check its nearest existing parent so
  // a symlinked directory cannot redirect a future write outside the root.
  let existingPath = diskPath;
  const missingParts = [];
  while (true) {
    try {
      fs.lstatSync(existingPath);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(existingPath);
      if (parent === existingPath) throw error;
      missingParts.unshift(path.basename(existingPath));
      existingPath = parent;
    }
  }

  const realExistingPath = fs.realpathSync(existingPath);
  if (!isWithinWorkspace(realExistingPath, realRoot)) {
    throw new ValidationError('Path resolves outside workspace');
  }

  const resolvedExistingTarget = path.resolve(realExistingPath, ...missingParts);
  if (!isWithinWorkspace(resolvedExistingTarget, realRoot)) {
    throw new ValidationError('Path resolves outside workspace');
  }

  return diskPath;
}

module.exports = {
  normalizePath,
  isWithinWorkspace,
  validateFileName,
  validatePath,
  sanitizePath
};
