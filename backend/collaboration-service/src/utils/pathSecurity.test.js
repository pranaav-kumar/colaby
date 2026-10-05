const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizePath } = require('./pathSecurity');

describe('sanitizePath', () => {
  let tempRoot;
  let workspaceRoot;
  let outsideRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'colaby-path-security-'));
    workspaceRoot = path.join(tempRoot, 'workspace');
    outsideRoot = path.join(tempRoot, 'outside');
    fs.mkdirSync(workspaceRoot);
    fs.mkdirSync(outsideRoot);
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('preserves root-relative editor paths', () => {
    expect(sanitizePath('/src/App.jsx', workspaceRoot)).toBe(path.join(workspaceRoot, 'src', 'App.jsx'));
  });

  test('rejects parent-directory traversal before resolving a sink', () => {
    expect(() => sanitizePath('../../outside/secret.txt', workspaceRoot)).toThrow();
  });

  test('rejects symlinks whose target escapes the workspace', () => {
    fs.symlinkSync(outsideRoot, path.join(workspaceRoot, 'external'));
    expect(() => sanitizePath('/external/secret.txt', workspaceRoot)).toThrow('Path resolves outside workspace');
  });

  test('allows a symlink that resolves within the workspace', () => {
    const internalDir = path.join(workspaceRoot, 'internal');
    fs.mkdirSync(internalDir);
    fs.symlinkSync(internalDir, path.join(workspaceRoot, 'link'));
    expect(sanitizePath('/link/file.txt', workspaceRoot)).toBe(path.join(workspaceRoot, 'link', 'file.txt'));
  });
});
