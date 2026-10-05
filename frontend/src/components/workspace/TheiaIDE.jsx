import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/useAuth';
import { startTheiaIDE, getTheiaIDE, stopTheiaIDE, cloneRepository, getTerminalToken } from '../../api/collaborationApi';
import {
  IconGitClone,
  IconRefresh,
  IconGlobe,
  IconCheck,
  IconX
} from '../common/Icons';
import * as Y from 'yjs';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function uint8ArrayToBase64(u8) {
  let binary = '';
  const len = u8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  return window.btoa(binary);
}

function base64ToUint8Array(b64) {
  const binaryString = window.atob(b64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Generate a unique update ID for end-to-end tracing */
function generateUpdateId(userId) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  return `${userId}-${ts}-${rand}`;
}

// Collaborator color palette for presence indicators
const COLLABORATOR_COLORS = [
  { hex: '#22D3EE', name: 'cyan' },
  { hex: '#6366F1', name: 'indigo' },
  { hex: '#34D399', name: 'emerald' },
  { hex: '#F472B6', name: 'pink' },
  { hex: '#FBBF24', name: 'amber' },
  { hex: '#38BDF8', name: 'sky' },
  { hex: '#A78BFA', name: 'purple' },
  { hex: '#FB923C', name: 'orange' }
];

function getUserColor(id = '') {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length].hex;
}

function normalizeFilePath(p = '') {
  if (!p) return '/';
  let clean = String(p).replace(/\\/g, '/').trim();
  if (!clean.startsWith('/')) clean = '/' + clean;
  return clean;
}

function getTheiaOrigin(iframe) {
  if (!iframe?.src) return null;
  try {
    return new URL(iframe.src, window.location.href).origin;
  } catch (_) {
    return null;
  }
}

function postToTheia(iframe, message) {
  const target = iframe?.contentWindow;
  const origin = getTheiaOrigin(iframe);
  if (!target || !origin) return;
  target.postMessage(message, origin);
}

function getFileBasename(filePath = '') {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

// Global binding generation counter for lifecycle & ownership validation
let _bindingGenerationCounter = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function TheiaIDE() {
  const { projectId, wsConnection, members, onlineUserIds } = useWorkspace();
  const { user } = useAuth();

  const [theiaStatus, setTheiaStatus] = useState('idle');
  const [theiaUrl, setTheiaUrl] = useState(null);
  const [theiaPort, setTheiaPort] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [bootStep, setBootStep] = useState(1);
  const [iframeKey, setIframeKey] = useState(Date.now());

  const [collaborators, setCollaborators] = useState({});

  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloneRepoUrl, setCloneRepoUrl] = useState('');
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneSuccessMsg, setCloneSuccessMsg] = useState(null);

  const iframeRef = useRef(null);
  const pollTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // Stable references for event listeners
  const wsConnectionRef = useRef(wsConnection);
  wsConnectionRef.current = wsConnection;
  const userRef = useRef(user);
  userRef.current = user;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // Determine if current user is the project creator from members list
  const isCreator = useMemo(() => {
    if (!user?.userId || !members?.length) return false;
    const me = members.find(m =>
      (m.userId || m.id || m.user?.id || m.user?.userId) === user.userId
    );
    return me?.role === 'CREATOR' || me?.role === 'creator';
  }, [user, members]);

  // ── 1. Boot sequence ───────────────────────────────────────────────────────
  const startBooting = useCallback(async () => {
    const pId = projectIdRef.current;
    if (!pId) return;

    setTheiaStatus('starting');
    setErrorMessage(null);
    setElapsedSeconds(0);
    setBootStep(1);

    try {
      setBootStep(1);
      const { data } = await startTheiaIDE(pId);
      const theiaInfo = data?.data || data;

      if (!mountedRef.current) return;

      const port = theiaInfo?.port || 9100;
      setTheiaPort(port);
      const targetUrl = new URL(`http://localhost:${port}/`);
      targetUrl.searchParams.set('colabyParentOrigin', window.location.origin);
      targetUrl.hash = '/home/project';
      setTheiaUrl(targetUrl.toString());
      setBootStep(2);

      const pollStatus = async () => {
        try {
          const res = await getTheiaIDE(pId);
          const current = res?.data?.data || res?.data;
          if (!mountedRef.current) return;
          if (current?.status === 'ready') {
            setBootStep(4);
            setTheiaStatus('ready');
            clearInterval(pollTimerRef.current);
            clearInterval(elapsedTimerRef.current);
          } else if (current?.status === 'error') {
            setTheiaStatus('error');
            setErrorMessage('Theia container encountered an error during boot.');
            clearInterval(pollTimerRef.current);
            clearInterval(elapsedTimerRef.current);
          } else {
            setBootStep(3);
          }
        } catch { }
      };

      pollTimerRef.current = setInterval(pollStatus, 2000);
      pollStatus();
    } catch (err) {
      if (!mountedRef.current) return;
      setTheiaStatus('error');
      setErrorMessage(
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Could not communicate with Docker. Ensure Docker Desktop is running.'
      );
      clearInterval(pollTimerRef.current);
      clearInterval(elapsedTimerRef.current);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    startBooting();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
    return () => {
      mountedRef.current = false;
      clearInterval(pollTimerRef.current);
      clearInterval(elapsedTimerRef.current);
    };
  }, [startBooting]);

  const handleRestartTheia = async () => {
    try { await stopTheiaIDE(projectIdRef.current); } catch { }
    startBooting();
  };

  const handleReloadIframe = () => setIframeKey(Date.now());

  // ── 2. Push user role to iframe bridge ────────────────────────────────────
  useEffect(() => {
    if (theiaStatus !== 'ready' || !iframeRef.current?.contentWindow) return;
    const timer = setTimeout(() => {
      if (!iframeRef.current?.contentWindow) return;
      postToTheia(iframeRef.current, {
        type: 'COLABY_USER_ROLE',
        role: isCreator ? 'CREATOR' : 'MEMBER',
        isCreator,
        projectId: projectIdRef.current
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [theiaStatus, iframeKey, isCreator]);

  // ── 3. Forward presence map to iframe for remote carets ───────────────────
  useEffect(() => {
    if (theiaStatus !== 'ready' || !iframeRef.current?.contentWindow) return;
    postToTheia(iframeRef.current, {
      type: 'COLABY_REMOTE_PRESENCE',
      collaborators
    });
  }, [collaborators, theiaStatus]);

  // ── 4. Yjs CRDT bridge with Generation & Ownership Guards ─────────────────
  const yDocsRef = useRef(new Map());

  // Expose global diagnostics helper on top-level window for runtime inspection
  useEffect(() => {
    window.__colabyCollab = {
      version: '2026-09-09-PROD-02',
      getDocs: () => {
        const result = {};
        yDocsRef.current.forEach((entry, path) => {
          result[path] = {
            canonical: entry.canonical,
            length: entry.ytext.length,
            content: entry.ytext.toString(),
            generation: entry.generation,
            isInitialized: entry.isInitialized
          };
        });
        return result;
      },
      getCollaborators: () => collaborators,
      getStatus: () => ({
        projectId: projectIdRef.current,
        theiaStatus,
        theiaPort,
        theiaUrl,
        user: userRef.current,
        isCreator,
        wsConnected: wsConnectionRef.current?.isConnected?.() ?? !!wsConnectionRef.current,
        openDocCount: yDocsRef.current.size
      })
    };
    window.inspectColaby = () => {
      console.log('[COLABY-RUNTIME] Status:', window.__colabyCollab.getStatus());
      console.log('[COLABY-RUNTIME] Open Documents:', window.__colabyCollab.getDocs());
      console.log('[COLABY-RUNTIME] Active Collaborators:', window.__colabyCollab.getCollaborators());
    };
    return () => {
      delete window.__colabyCollab;
      delete window.inspectColaby;
    };
  }, [theiaStatus, theiaPort, theiaUrl, isCreator, collaborators]);

  const getOrCreateYDoc = useCallback((filePath) => {
    const canonical = normalizeFilePath(filePath);
    if (!yDocsRef.current.has(canonical)) {
      const doc = new Y.Doc();
      const ytext = doc.getText('monaco');
      const generation = ++_bindingGenerationCounter;

      console.log('[COLLAB-FILE] YDOC_CREATED', {
        workspaceId: projectIdRef.current,
        canonicalFilePath: canonical,
        roomId: `${projectIdRef.current}:${canonical}`,
        generation
      });

      doc.on('update', (update, origin) => {
        if (origin === 'monaco-local' && wsConnectionRef.current?.sendMessage) {
          const entry = yDocsRef.current.get(canonical);
          const uId = userRef.current?.userId || userRef.current?.id || 'unknown';
          const updateId = entry?.pendingLocalUpdateId || generateUpdateId(uId);
          if (entry) entry.pendingLocalUpdateId = null;
          const sendTimestamp = Date.now();
          const modelUri = entry?.modelUri || `file:///home/project${canonical}`;
          const modelVersionId = entry?.modelVersionId || 1;

          // ── [COLAB-LIVE] A_YJS_TRANSACTION ───────────────────────────────
          console.log('[COLAB-LIVE] A_YJS_TRANSACTION', {
            updateId,
            userId: uId,
            filePath: canonical,
            canonicalPath: canonical,
            ydocKey: `${projectIdRef.current}:${canonical}`,
            modelUri,
            modelVersionId,
            timestamp: new Date(sendTimestamp).toISOString()
          });

          // ── [COLAB-LIVE] A_WS_SEND ─────────────────────────────────────────
          console.log('[COLAB-LIVE] A_WS_SEND', {
            updateId,
            userId: uId,
            filePath: canonical,
            canonicalPath: canonical,
            ydocKey: `${projectIdRef.current}:${canonical}`,
            modelUri,
            modelVersionId,
            timestamp: new Date(sendTimestamp).toISOString()
          });

          wsConnectionRef.current.sendMessage('CODE_OPERATION', {
            filePath: canonical,
            update: uint8ArrayToBase64(update),
            content: ytext.toString(),
            userId: uId,
            userName: userRef.current?.username || userRef.current?.email || 'User',
            updateId,
            modelUri,
            modelVersionId,
            sendTimestamp
          });
        }
      });

      ytext.observe((event) => {
        const origin = event.transaction.origin;
        if (origin === 'yjs-remote' || origin === 'sync') {
          const applyTs = Date.now();
          const newContent = ytext.toString();
          const entry = yDocsRef.current.get(canonical);
          const pendingMeta = entry?._pendingRemoteMeta || {};
          const myId = userRef.current?.userId || userRef.current?.id;
          const updateId = pendingMeta.updateId || generateUpdateId('rec');
          const modelUri = entry?.modelUri || `file:///home/project${canonical}`;
          const modelVersionId = entry?.modelVersionId || 0;

          // ── [COLAB-LIVE] B_YTEXT_OBSERVER ────────────────────────────────
          console.log('[COLAB-LIVE] B_YTEXT_OBSERVER', {
            updateId,
            userId: myId,
            filePath: canonical,
            canonicalPath: canonical,
            ydocKey: `${projectIdRef.current}:${canonical}`,
            modelUri,
            modelVersionId,
            timestamp: new Date(applyTs).toISOString()
          });

          if (iframeRef.current?.contentWindow) {
            postToTheia(iframeRef.current, {
              type: 'COLABY_REMOTE_EDIT',
              filePath: canonical,
              content: newContent,
              updateId,
              userId: myId,
              senderUserId: pendingMeta.senderUserId || 'unknown',
              modelUri,
              modelVersionId
            });
          }
        }
      });

      const entry = {
        doc,
        ytext,
        canonical,
        generation,
        modelUri: `file:///home/project${canonical}`,
        modelVersionId: 0,
        pendingLocalUpdateId: null,
        isInitialized: false,
        isDisposed: false
      };
      yDocsRef.current.set(canonical, entry);
    } else {
      console.log('[COLLAB-FILE] YDOC_REUSED', {
        workspaceId: projectIdRef.current,
        canonicalFilePath: canonical,
        roomId: `${projectIdRef.current}:${canonical}`
      });
    }
    return yDocsRef.current.get(canonical);
  }, []);

  const requestCodeSync = useCallback((filePath, clientContent) => {
    if (!wsConnectionRef.current?.sendMessage) return;
    wsConnectionRef.current.sendMessage('CODE_SYNC', {
      filePath: normalizeFilePath(filePath),
      clientContent: clientContent || undefined
    });
  }, []);

  // Listen for messages from Theia iframe → apply to local Yjs doc → broadcast
  useEffect(() => {
    const handleTheiaBridgeMessage = (event) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      const iframeSrc = iframeRef.current?.src;
      let iframeOrigin;
      try {
        iframeOrigin = iframeSrc ? new URL(iframeSrc, window.location.href).origin : null;
      } catch (_) {
        return;
      }
      if (!iframeWindow || event.source !== iframeWindow || event.origin !== iframeOrigin) return;

      const data = event.data;
      if (!data || typeof data.filePath !== 'string' || !wsConnectionRef.current?.sendMessage) return;

      if (data.type === 'COLABY_THEIA_EDIT') {
        if (data.content !== undefined && typeof data.content !== 'string') return;
        if (data.operation !== undefined && (!data.operation || typeof data.operation !== 'object')) return;
        const canonical = normalizeFilePath(data.filePath);
        const entry = getOrCreateYDoc(canonical);
        if (!entry || entry.isDisposed) return;
        const { doc, ytext } = entry;

        entry.pendingLocalUpdateId = data.updateId || generateUpdateId(userRef.current?.userId || 'u');
        entry.modelUri = data.modelUri || entry.modelUri;
        entry.modelVersionId = data.modelVersionId || entry.modelVersionId;

        doc.transact(() => {
          // Case 1: Initial edit on unpopulated Y.Text
          if (ytext.length === 0 && data.content) {
            ytext.insert(0, data.content);
            entry.isInitialized = true;
            return;
          }

          // Case 2: Incremental Monaco edit with rangeOffset and rangeLength
          if (data.operation && typeof data.operation.rangeOffset === 'number') {
            const offset = Math.max(0, Math.min(ytext.length, data.operation.rangeOffset));
            const delLen = Math.max(0, Math.min(ytext.length - offset, data.operation.rangeLength || 0));

            // Only delete if there is text to delete and delLen > 0
            if (delLen > 0 && ytext.length > 0) {
              ytext.delete(offset, delLen);
            }
            if (data.operation.text) {
              ytext.insert(offset, data.operation.text);
            }
          } else if (data.content !== undefined && ytext.toString() !== data.content) {
            // Case 3: Full content replacement or divergence reconciliation
            if (ytext.length > 0) {
              ytext.delete(0, ytext.length);
            }
            if (data.content.length > 0) {
              ytext.insert(0, data.content);
            }
          }
        }, 'monaco-local');

      } else if (data.type === 'COLABY_THEIA_FILE_OPENED') {
        const canonical = normalizeFilePath(data.filePath);
        console.log('[COLLAB-FILE] FILE_OPEN_DETECTED', {
          workspaceId: projectIdRef.current,
          rawFilePath: data.filePath,
          canonicalFilePath: canonical,
          roomId: `${projectIdRef.current}:${canonical}`
        });

        const entry = getOrCreateYDoc(canonical);
        if (entry && !entry.isDisposed) {
          entry.modelUri = data.modelUri || `file:///home/project${canonical}`;
          entry.modelVersionId = data.modelVersionId || 1;

          if (entry.ytext.length > 0) {
            // Y.Doc already contains active collaborative state — sync it immediately to the newly opened Monaco model!
            if (iframeRef.current?.contentWindow) {
              postToTheia(iframeRef.current, {
                type: 'COLABY_REMOTE_EDIT',
                filePath: canonical,
                content: entry.ytext.toString(),
                updateId: generateUpdateId('init-sync'),
                userId: userRef.current?.userId || userRef.current?.id,
                modelUri: entry.modelUri,
                modelVersionId: entry.modelVersionId
              });
            }
          }
        }
        // Always request CODE_SYNC with clientContent to align root CRDT state from server
        requestCodeSync(canonical, data.content);

      } else if (data.type === 'COLABY_THEIA_CURSOR') {
        const canonical = normalizeFilePath(data.filePath);
        wsConnectionRef.current.sendMessage('CODE_CURSOR_MOVE', {
          filePath: canonical,
          position: data.position,
          userId: userRef.current?.userId || userRef.current?.id,
          userName: userRef.current?.username || userRef.current?.email || 'User'
        });

      } else if (data.type === 'COLABY_THEIA_SELECTION') {
        const canonical = normalizeFilePath(data.filePath);
        wsConnectionRef.current.sendMessage('CODE_SELECTION_CHANGE', {
          filePath: canonical,
          selection: data.selection,
          userId: userRef.current?.userId || userRef.current?.id
        });
      }
    };

    window.addEventListener('message', handleTheiaBridgeMessage);
    return () => window.removeEventListener('message', handleTheiaBridgeMessage);
  }, [getOrCreateYDoc, requestCodeSync]);

  // Listen for remote WebSocket events → apply Yjs → push to iframe
  useEffect(() => {
    if (!wsConnection?.subscribe) return;

    const unsubOp = wsConnection.subscribe('CODE_OPERATION', (payload) => {
      const myId = userRef.current?.userId || userRef.current?.id;
      if (!payload || payload.userId === myId) return;

      const canonical = normalizeFilePath(payload.filePath || payload.path);
      const wsReceiveTs = Date.now();
      const updateId = payload.updateId || generateUpdateId('op');
      const entry = getOrCreateYDoc(canonical);
      if (!entry || entry.isDisposed) return;
      const { doc, ytext } = entry;

      entry.modelUri = payload.modelUri || entry.modelUri || `file:///home/project${canonical}`;
      entry.modelVersionId = payload.modelVersionId || entry.modelVersionId || 0;

      // ── [COLAB-LIVE] B_WS_RECEIVE ─────────────────────────────────────────
      console.log('[COLAB-LIVE] B_WS_RECEIVE', {
        updateId,
        userId: myId,
        filePath: canonical,
        canonicalPath: canonical,
        ydocKey: `${projectIdRef.current}:${canonical}`,
        modelUri: entry.modelUri,
        modelVersionId: entry.modelVersionId,
        timestamp: new Date(wsReceiveTs).toISOString()
      });

      // Store remote metadata on entry so ytext.observe can read it
      entry._pendingRemoteMeta = {
        updateId,
        senderUserId: payload.userId,
        sendTimestamp: payload.sendTimestamp || null,
        modelUri: entry.modelUri,
        modelVersionId: entry.modelVersionId
      };

      const updateBytes = payload.update ? base64ToUint8Array(payload.update) : null;

      // ── [COLAB-LIVE] B_YJS_APPLY_START ────────────────────────────────────
      console.log('[COLAB-LIVE] B_YJS_APPLY_START', {
        updateId,
        userId: myId,
        filePath: canonical,
        canonicalPath: canonical,
        ydocKey: `${projectIdRef.current}:${canonical}`,
        modelUri: entry.modelUri,
        modelVersionId: entry.modelVersionId,
        timestamp: new Date(Date.now()).toISOString()
      });

      if (updateBytes) {
        try {
          Y.applyUpdate(doc, updateBytes, 'yjs-remote');
        } catch (err) {
          console.error('[COLAB-LIVE] B_YJS_APPLY_ERROR', {
            recipient: myId,
            updateId,
            error: err.message
          });
        }
      }

      // ── [COLAB-LIVE] B_YJS_APPLY_COMPLETE ─────────────────────────────────
      console.log('[COLAB-LIVE] B_YJS_APPLY_COMPLETE', {
        updateId,
        userId: myId,
        filePath: canonical,
        canonicalPath: canonical,
        ydocKey: `${projectIdRef.current}:${canonical}`,
        modelUri: entry.modelUri,
        modelVersionId: entry.modelVersionId,
        timestamp: new Date(Date.now()).toISOString()
      });

      // SAFEGUARD: If desync or missing structs occurred, ensure Monaco updates immediately
      if (payload.content !== undefined && ytext.toString() !== payload.content) {
        if (doc.store.pendingStructs !== null) {
          console.warn('[COLAB-LIVE] DESYNC_DETECTED — missing structs, requesting CODE_SYNC', { updateId, canonical });
          requestCodeSync(canonical);
        }
        if (iframeRef.current?.contentWindow) {
          postToTheia(iframeRef.current, {
            type: 'COLABY_REMOTE_EDIT',
            filePath: canonical,
            content: payload.content,
            updateId,
            userId: myId,
            senderUserId: payload.userId,
            modelUri: entry.modelUri,
            modelVersionId: entry.modelVersionId
          });
        }
      }

      const collabColor = getUserColor(payload.userId);
      setCollaborators(prev => ({
        ...prev,
        [payload.userId]: {
          ...prev[payload.userId],
          userId: payload.userId,
          userName: payload.userName || 'Collaborator',
          filePath: canonical,
          color: prev[payload.userId]?.color || collabColor,
          lastActive: Date.now()
        }
      }));
    });

    const unsubSync = wsConnection.subscribe('CODE_SYNC', (payload) => {
      if (!payload?.filePath || !payload?.encodedState) return;
      const canonical = normalizeFilePath(payload.filePath);
      const entry = getOrCreateYDoc(canonical);
      if (!entry || entry.isDisposed) return;
      const { doc, ytext } = entry;
      try {
        Y.applyUpdate(doc, base64ToUint8Array(payload.encodedState), 'sync');
      } catch (err) {
        console.error('[Colaby] Error applying CODE_SYNC state:', err);
      }
      // Ensure the iframe receives the latest state from CODE_SYNC
      if (iframeRef.current?.contentWindow && ytext.length > 0) {
        postToTheia(iframeRef.current, {
          type: 'COLABY_REMOTE_EDIT',
          filePath: canonical,
          content: ytext.toString(),
          updateId: generateUpdateId('sync'),
          userId: userRef.current?.userId || userRef.current?.id,
          modelUri: entry.modelUri,
          modelVersionId: entry.modelVersionId
        });
      }
    });

    const unsubCursor = wsConnection.subscribe('CODE_CURSOR_MOVE', (payload) => {
      const myId = userRef.current?.userId || userRef.current?.id;
      if (!payload || payload.userId === myId) return;
      const canonical = normalizeFilePath(payload.filePath || payload.path);
      setCollaborators(prev => ({
        ...prev,
        [payload.userId]: {
          ...prev[payload.userId],
          userId: payload.userId,
          userName: payload.userName || 'Collaborator',
          filePath: canonical,
          position: payload.position,
          color: prev[payload.userId]?.color || getUserColor(payload.userId),
          lastActive: Date.now()
        }
      }));
    });

    const unsubSelection = wsConnection.subscribe('CODE_SELECTION_CHANGE', (payload) => {
      const myId = userRef.current?.userId || userRef.current?.id;
      if (!payload || payload.userId === myId) return;
      const canonical = normalizeFilePath(payload.filePath || payload.path);
      setCollaborators(prev => ({
        ...prev,
        [payload.userId]: {
          ...prev[payload.userId],
          filePath: canonical,
          selection: payload.selection,
          lastActive: Date.now()
        }
      }));
    });

    const handleUserJoined = (payload) => {
      const myId = String(userRef.current?.userId || userRef.current?.id || '').toLowerCase();
      if (!payload?.userId || String(payload.userId).toLowerCase() === myId) return;
      const uId = String(payload.userId).toLowerCase();
      const collabColor = getUserColor(uId);

      setCollaborators(prev => {
        const next = {
          ...prev,
          [uId]: {
            ...prev[uId],
            userId: uId,
            userName: payload.userName || prev[uId]?.userName || 'Collaborator',
            color: prev[uId]?.color || collabColor,
            isOnline: true,
            lastActive: Date.now()
          }
        };
        if (iframeRef.current?.contentWindow) {
          postToTheia(iframeRef.current, {
            type: 'COLABY_REMOTE_PRESENCE',
            collaborators: next
          });
        }
        return next;
      });
    };

    const handleUserLeft = (payload) => {
      if (!payload?.userId) return;
      const uId = String(payload.userId).toLowerCase();

      setCollaborators(prev => {
        const next = { ...prev };
        delete next[uId];
        if (iframeRef.current?.contentWindow) {
          postToTheia(iframeRef.current, {
            type: 'COLABY_REMOTE_PRESENCE',
            collaborators: next
          });
        }
        return next;
      });
    };

    const unsubJoin = wsConnection.subscribe('USER_JOINED', handleUserJoined);
    const unsubLeft = wsConnection.subscribe('USER_LEFT', handleUserLeft);

    return () => {
      unsubOp?.();
      unsubSync?.();
      unsubCursor?.();
      unsubSelection?.();
      unsubJoin?.();
      unsubLeft?.();
    };
  }, [wsConnection, getOrCreateYDoc]);

  // ── 5. Git Clone ───────────────────────────────────────────────────────────
  const handleCloneSubmit = async (e) => {
    e.preventDefault();
    if (!cloneRepoUrl.trim()) return;
    setCloneLoading(true);
    setCloneSuccessMsg(null);
    try {
      await cloneRepository(projectIdRef.current, null, cloneRepoUrl.trim());
      setCloneSuccessMsg('Repository cloned successfully! Reloading Theia workspace…');
      setTimeout(() => {
        setIsCloneModalOpen(false);
        setCloneRepoUrl('');
        setCloneSuccessMsg(null);
        handleReloadIframe();
      }, 1500);
    } catch (err) {
      alert('Clone failed: ' + (
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err.message
      ));
    } finally {
      setCloneLoading(false);
    }
  };

  const activePeers = useMemo(() => {
    const myId = String(user?.userId || user?.id || '').toLowerCase();
    const peerIds = (onlineUserIds || []).filter(id => id && String(id).toLowerCase() !== myId);

    return peerIds.map(uId => {
      const rawId = String(uId).toLowerCase();
      const member = (members || []).find(m => {
        const mId = String(m.userId || m.id || m.user?.id || m.user?.userId || '').toLowerCase();
        return mId === rawId;
      });
      const name = member?.user?.name || member?.name || member?.user?.username || member?.username || collaborators[rawId]?.userName || 'Collaborator';
      const color = collaborators[rawId]?.color || getUserColor(rawId);
      const filePath = collaborators[rawId]?.filePath || 'online';
      return { userId: rawId, userName: name, color, filePath };
    });
  }, [onlineUserIds, members, collaborators, user]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, background: '#0B1020', overflow: 'hidden' }}>
      <style>{`
        @keyframes colaby-fadein {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Top IDE Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.45rem 1rem',
          background: '#11182A',
          borderBottom: '1px solid #26324A',
          minHeight: '40px',
          flexShrink: 0,
          userSelect: 'none',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: theiaStatus === 'ready' ? '#34D399' : theiaStatus === 'starting' ? '#FBBF24' : '#F87171'
              }}
            />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E5E7EB', letterSpacing: '0.01em' }}>
              Eclipse Theia IDE
            </span>
          </div>

          <span style={{ fontSize: '0.74rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
            /home/project
          </span>

          {activePeers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: '#161F35', padding: '0.2rem 0.6rem', borderRadius: '14px', border: '1px solid #26324A' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34D399' }} />
              <span style={{ fontSize: '0.72rem', color: '#34D399', fontWeight: 500 }}>
                Live Collaboration: {activePeers.length} {activePeers.length === 1 ? 'peer' : 'peers'}
              </span>
              <div style={{ display: 'flex', gap: '3px', marginLeft: '2px' }}>
                {activePeers.map(c => (
                  <span
                    key={c.userId}
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      background: c.color,
                      fontSize: '9px',
                      color: '#000',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700
                    }}
                    title={`${c.userName} (${c.filePath})`}
                  >
                    {(c.userName || 'U')[0].toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '0.25rem 0.65rem', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            onClick={() => setIsCloneModalOpen(true)}
            title="Clone Git repository into workspace"
          >
            <IconGitClone width={13} height={13} />
            <span>Clone Repository</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '0.25rem 0.65rem', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            onClick={handleReloadIframe}
            title="Reload IDE interface"
          >
            <IconRefresh width={13} height={13} />
            <span>Reload</span>
          </button>

          {theiaUrl && (
            <a
              href={theiaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none' }}
              title="Open full IDE in new window"
            >
              <IconGlobe width={13} height={13} />
              <span>Open in New Tab</span>
            </a>
          )}
        </div>
      </header>

      {/* Main IDE frame */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: 0, minHeight: 0, overflow: 'hidden' }}>
        {theiaStatus === 'ready' && theiaUrl ? (
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={theiaUrl}
            title="Eclipse Theia IDE"
            style={{ width: '100%', height: '100%', border: 'none', background: '#0B1020' }}
            allow="clipboard-read; clipboard-write; fullscreen"
            sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups allow-downloads"
          />
        ) : theiaStatus === 'error' ? (
          <div className="theia-loading-screen">
            <div className="theia-error-panel">
              <h3 style={{ color: '#F87171', margin: '0 0 0.5rem 0' }}>Eclipse Theia Startup Failed</h3>
              <p style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>{errorMessage}</p>
              <button type="button" className="btn-primary" onClick={handleRestartTheia}>
                Retry Launch
              </button>
            </div>
          </div>
        ) : (
          <div className="theia-loading-screen">
            <div className="theia-loading-panel">
              <h3 style={{ margin: '0 0 0.35rem 0', color: '#E5E7EB', fontSize: '1rem' }}>
                Launching Eclipse Theia IDE
              </h3>
              <p style={{ margin: '0 0 1.25rem 0', color: '#64748B', fontSize: '0.78rem' }}>
                Initializing containerized development workspace ({elapsedSeconds}s)
              </p>
              <div className="theia-steps">
                <div className={`theia-step ${bootStep >= 1 ? 'active' : ''} ${bootStep > 1 ? 'done' : ''}`}>
                  <div className="theia-step-dot" />
                  <span>Requesting container instance</span>
                </div>
                <div className={`theia-step ${bootStep >= 2 ? 'active' : ''} ${bootStep > 2 ? 'done' : ''}`}>
                  <div className="theia-step-dot" />
                  <span>Mounting workspace directory (/home/project)</span>
                </div>
                <div className={`theia-step ${bootStep >= 3 ? 'active' : ''} ${bootStep > 3 ? 'done' : ''}`}>
                  <div className="theia-step-dot" />
                  <span>Starting Eclipse Theia language &amp; file services</span>
                </div>
                <div className={`theia-step ${bootStep >= 4 ? 'active' : ''}`}>
                  <div className="theia-step-dot" />
                  <span>Ready</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Git Clone Modal */}
      {isCloneModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#161F35', border: '1px solid #26324A', borderRadius: '8px', padding: '1.75rem', width: '450px', maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#E5E7EB' }}>Clone Git Repository</h3>
            <p style={{ fontSize: '0.82rem', color: '#94A3B8', margin: '0 0 1rem 0' }}>
              Enter a public HTTPS repository URL to populate this workspace.
            </p>
            {cloneSuccessMsg ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34D399', fontSize: '0.85rem' }}>
                <IconCheck width={16} height={16} />
                <span>{cloneSuccessMsg}</span>
              </div>
            ) : (
              <form onSubmit={handleCloneSubmit}>
                <input
                  type="text"
                  required
                  className="input-field"
                  placeholder="https://github.com/username/repo.git"
                  value={cloneRepoUrl}
                  onChange={e => setCloneRepoUrl(e.target.value)}
                  style={{ width: '100%', marginBottom: '1rem' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn-secondary" disabled={cloneLoading} onClick={() => setIsCloneModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={cloneLoading}>
                    {cloneLoading ? 'Cloning…' : 'Clone'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
