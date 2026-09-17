import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getFolders, createFolder, deleteFolder,
  getNotes, createNote, updateNote, deleteNote,
  extractProjectError,
} from '../../api/projectApi';

/* ─────────── tiny helpers ─────────── */
const timeAgo = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
};

const UNSAVED_DELAY = 1200; // ms after last keystroke before auto-save

export default function ProjectNotes({ projectId }) {
  /* ── data ── */
  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  /* ── sidebar selection ── */
  const [selectedFolderId, setSelectedFolderId] = useState(null); // null = root / all
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  /* ── active note ── */
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved'
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef({ title: '', content: '' });

  /* ── new folder form ── */
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState(null);
  const [folderCreating, setFolderCreating] = useState(false);
  const [folderError, setFolderError] = useState('');

  /* ── search ── */
  const [searchQuery, setSearchQuery] = useState('');

  /* ── confirm delete ── */
  const [confirmDelete, setConfirmDelete] = useState(null); // { type:'note'|'folder', id, name }

  /* ─────────────────────────────────────────
     Load all data
  ───────────────────────────────────────── */
  useEffect(() => {
    loadAll();
  }, [projectId]);

  async function loadAll() {
    setLoading(true);
    setLoadError('');
    try {
      const [fRes, nRes] = await Promise.all([
        getFolders(projectId),
        getNotes(projectId),
      ]);
      setFolders(Array.isArray(fRes.data) ? fRes.data : []);
      setNotes(Array.isArray(nRes.data) ? nRes.data : []);
    } catch (err) {
      setLoadError(extractProjectError(err));
    } finally {
      setLoading(false);
    }
  }

  /* ─────────────────────────────────────────
     Note selection
  ───────────────────────────────────────── */
  function openNote(note) {
    // Save pending changes first
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      if (activeNoteId && saveStatus === 'unsaved') {
        flushSave(activeNoteId, editorTitle, editorContent);
      }
    }
    setActiveNoteId(note.id);
    setEditorTitle(note.title);
    setEditorContent(note.content || '');
    setSaveStatus('saved');
    lastSavedRef.current = { title: note.title, content: note.content || '' };
  }

  /* ─────────────────────────────────────────
     Auto-save
  ───────────────────────────────────────── */
  const scheduleAutoSave = useCallback((id, title, content) => {
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushSave(id, title, content), UNSAVED_DELAY);
  }, []);

  async function flushSave(id, title, content) {
    if (!id) return;
    if (title === lastSavedRef.current.title && content === lastSavedRef.current.content) {
      setSaveStatus('saved');
      return;
    }
    setSaveStatus('saving');
    try {
      const res = await updateNote(projectId, id, { title, content });
      lastSavedRef.current = { title, content };
      setSaveStatus('saved');
      // Update notes list without re-loading
      setNotes(prev => prev.map(n => n.id === id ? { ...n, ...res.data } : n));
    } catch {
      setSaveStatus('unsaved');
    }
  }

  function handleTitleChange(val) {
    setEditorTitle(val);
    scheduleAutoSave(activeNoteId, val, editorContent);
  }

  function handleContentChange(val) {
    setEditorContent(val);
    scheduleAutoSave(activeNoteId, editorTitle, val);
  }

  /* ─────────────────────────────────────────
     Create new note
  ───────────────────────────────────────── */
  async function handleNewNote(folderId = null) {
    try {
      const res = await createNote(projectId, {
        title: 'Untitled',
        content: '',
        folderId: folderId,
      });
      const newNote = res.data;
      setNotes(prev => [newNote, ...prev]);
      openNote(newNote);
      if (folderId) {
        setExpandedFolders(prev => new Set([...prev, folderId]));
        setSelectedFolderId(folderId);
      } else {
        setSelectedFolderId(null);
      }
    } catch (err) {
      console.error('Failed to create note', err);
    }
  }

  /* ─────────────────────────────────────────
     Create folder
  ───────────────────────────────────────── */
  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setFolderCreating(true);
    setFolderError('');
    try {
      const res = await createFolder(projectId, {
        name: newFolderName.trim(),
        parentFolderId: newFolderParent,
      });
      setFolders(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFolderName('');
      setShowFolderForm(false);
      setExpandedFolders(prev => new Set([...prev, res.data.id]));
    } catch (err) {
      setFolderError(extractProjectError(err));
    } finally {
      setFolderCreating(false);
    }
  }

  /* ─────────────────────────────────────────
     Delete
  ───────────────────────────────────────── */
  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    setConfirmDelete(null);
    try {
      if (type === 'note') {
        await deleteNote(projectId, id);
        setNotes(prev => prev.filter(n => n.id !== id));
        if (activeNoteId === id) {
          setActiveNoteId(null);
          setEditorTitle('');
          setEditorContent('');
        }
      } else {
        await deleteFolder(projectId, id);
        setFolders(prev => prev.filter(f => f.id !== id));
        setNotes(prev => prev.filter(n => n.folderId !== id));
        if (selectedFolderId === id) setSelectedFolderId(null);
      }
    } catch (err) {
      console.error('Delete failed', err);
    }
  }

  /* ─────────────────────────────────────────
     Derived views
  ───────────────────────────────────────── */
  const filteredNotes = notes.filter(n => {
    const matchesFolder =
      selectedFolderId === null
        ? true
        : selectedFolderId === '__root__'
        ? !n.folderId
        : n.folderId === selectedFolderId;

    if (!matchesFolder) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
  });

  const activeNote = notes.find(n => n.id === activeNoteId);

  /* ─────────────────────────────────────────
     Word / char count
  ───────────────────────────────────────── */
  const wordCount = editorContent.trim()
    ? editorContent.trim().split(/\s+/).length
    : 0;

  /* ─────────────────────────────────────────
     Render
  ───────────────────────────────────────── */
  if (loading) {
    return (
      <div className="notes-loading">
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <p>Loading notes…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="notes-error">
        <span>⚠ {loadError}</span>
        <button className="btn-secondary" onClick={loadAll}>Retry</button>
      </div>
    );
  }

  return (
    <div className="notes-shell">

      {/* ── Folder / File Tree Sidebar ── */}
      <aside className="notes-tree">
        {/* header */}
        <div className="notes-tree-header">
          <span className="notes-tree-title">Notes</span>
          <div className="notes-tree-actions">
            <button
              className="notes-icon-btn"
              title="New note"
              onClick={() => handleNewNote(selectedFolderId === '__root__' ? null : selectedFolderId)}
            >
              {/* pencil + */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
                <path d="M18.37 2.63a2 2 0 0 1 2.83 2.83L10 17l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              className="notes-icon-btn"
              title="New folder"
              onClick={() => { setShowFolderForm(true); setNewFolderParent(null); setFolderError(''); }}
            >
              {/* folder + */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </button>
          </div>
        </div>

        {/* search */}
        <div className="notes-search-wrap">
          <svg className="notes-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="notes-search"
            placeholder="Search notes…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* new folder inline form */}
        {showFolderForm && (
          <form className="notes-folder-form" onSubmit={handleCreateFolder}>
            <input
              autoFocus
              className="notes-folder-input"
              placeholder="Folder name…"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              disabled={folderCreating}
            />
            {folderError && <span className="notes-folder-err">{folderError}</span>}
            <div className="notes-folder-form-actions">
              <button type="submit" className="notes-folder-create-btn" disabled={folderCreating || !newFolderName.trim()}>
                {folderCreating ? '…' : 'Create'}
              </button>
              <button type="button" className="notes-folder-cancel-btn" onClick={() => setShowFolderForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* tree items */}
        <nav className="notes-tree-nav">
          {/* All Notes */}
          <button
            className={`notes-tree-item notes-tree-all${selectedFolderId === null && !searchQuery ? ' active' : ''}`}
            onClick={() => setSelectedFolderId(null)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" />
            </svg>
            <span>All Notes</span>
            <span className="notes-tree-count">{notes.length}</span>
          </button>

          {/* Root notes (no folder) */}
          {notes.some(n => !n.folderId) && (
            <button
              className={`notes-tree-item notes-tree-root${selectedFolderId === '__root__' ? ' active' : ''}`}
              onClick={() => setSelectedFolderId('__root__')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9,22 9,12 15,12 15,22" />
              </svg>
              <span>Root</span>
              <span className="notes-tree-count">{notes.filter(n => !n.folderId).length}</span>
            </button>
          )}

          {/* Folders */}
          {folders.filter(f => !f.parentFolderId).map(folder => (
            <FolderTreeItem
              key={folder.id}
              folder={folder}
              allFolders={folders}
              notes={notes}
              selectedFolderId={selectedFolderId}
              setSelectedFolderId={setSelectedFolderId}
              expandedFolders={expandedFolders}
              setExpandedFolders={setExpandedFolders}
              activeNoteId={activeNoteId}
              onOpenNote={openNote}
              onNewNote={handleNewNote}
              onDeleteFolder={(f) => setConfirmDelete({ type: 'folder', id: f.id, name: f.name })}
              onDeleteNote={(n) => setConfirmDelete({ type: 'note', id: n.id, name: n.title })}
            />
          ))}
        </nav>
      </aside>

      {/* ── Note List Panel ── */}
      <div className="notes-list-panel">
        <div className="notes-list-header">
          <span className="notes-list-label">
            {selectedFolderId === null
              ? 'All Notes'
              : selectedFolderId === '__root__'
              ? 'Root Notes'
              : folders.find(f => f.id === selectedFolderId)?.name || 'Notes'}
          </span>
          <button
            className="notes-new-btn"
            onClick={() => handleNewNote(selectedFolderId === '__root__' ? null : selectedFolderId === null ? null : selectedFolderId)}
          >
            + New Note
          </button>
        </div>

        <div className="notes-list-scroll">
          {filteredNotes.length === 0 ? (
            <div className="notes-list-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" />
                <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10,9 9,9 8,9" />
              </svg>
              <p>{searchQuery ? 'No notes match your search.' : 'No notes yet. Create one!'}</p>
            </div>
          ) : (
            filteredNotes.map(note => (
              <button
                key={note.id}
                className={`notes-list-item${note.id === activeNoteId ? ' active' : ''}`}
                onClick={() => openNote(note)}
              >
                <div className="notes-list-item-title">{note.title || 'Untitled'}</div>
                <div className="notes-list-item-preview">
                  {(note.content || '').replace(/\n/g, ' ').slice(0, 80) || 'Empty note'}
                </div>
                <div className="notes-list-item-meta">
                  <span className="notes-list-item-time">{timeAgo(note.updatedAt)}</span>
                  {note.folderId && (
                    <span className="notes-list-item-folder">
                      {folders.find(f => f.id === note.folderId)?.name}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Editor Panel ── */}
      <div className="notes-editor-panel">
        {activeNote ? (
          <>
            {/* Editor toolbar */}
            <div className="notes-editor-toolbar">
              <div className="notes-editor-breadcrumb">
                {activeNote.folderId && (
                  <>
                    <span>{folders.find(f => f.id === activeNote.folderId)?.name}</span>
                    <span className="notes-bc-sep">/</span>
                  </>
                )}
                <span className="notes-bc-current">{editorTitle || 'Untitled'}</span>
              </div>
              <div className="notes-editor-toolbar-right">
                <span className={`notes-save-status notes-save-${saveStatus}`}>
                  {saveStatus === 'saving' && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />}
                  {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving…' : '● Unsaved'}
                </span>
                <span className="notes-word-count">{wordCount} words</span>
                <button
                  className="notes-delete-note-btn"
                  title="Delete note"
                  onClick={() => setConfirmDelete({ type: 'note', id: activeNote.id, name: activeNote.title })}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Title input */}
            <input
              className="notes-editor-title"
              placeholder="Note title…"
              value={editorTitle}
              onChange={e => handleTitleChange(e.target.value)}
            />

            {/* Content textarea */}
            <textarea
              className="notes-editor-body"
              placeholder="Start writing your note… (Markdown supported)"
              value={editorContent}
              onChange={e => handleContentChange(e.target.value)}
              spellCheck
            />

            {/* Footer meta */}
            <div className="notes-editor-footer">
              <span>Created {timeAgo(activeNote.createdAt)}</span>
              <span>·</span>
              <span>Last edited {timeAgo(activeNote.updatedAt)}</span>
            </div>
          </>
        ) : (
          <div className="notes-editor-empty">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <p>Select a note to start reading or editing</p>
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => handleNewNote()}>
              + Create Note
            </button>
          </div>
        )}
      </div>

      {/* ── Confirm Delete Modal ── */}
      {confirmDelete && (
        <div className="notes-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="notes-modal" onClick={e => e.stopPropagation()}>
            <h3 className="notes-modal-title">Delete {confirmDelete.type === 'folder' ? 'Folder' : 'Note'}?</h3>
            <p className="notes-modal-body">
              <strong>"{confirmDelete.name}"</strong> will be permanently deleted.
              {confirmDelete.type === 'folder' && ' All notes inside will also be deleted.'}
            </p>
            <div className="notes-modal-actions">
              <button className="btn-community-leave" onClick={handleConfirmDelete}>Delete</button>
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Recursive Folder Tree Item
───────────────────────────────────────── */
function FolderTreeItem({
  folder, allFolders, notes,
  selectedFolderId, setSelectedFolderId,
  expandedFolders, setExpandedFolders,
  activeNoteId, onOpenNote, onNewNote,
  onDeleteFolder, onDeleteNote,
}) {
  const isExpanded = expandedFolders.has(folder.id);
  const childFolders = allFolders.filter(f => f.parentFolderId === folder.id);
  const folderNotes = notes.filter(n => n.folderId === folder.id);
  const isSelected = selectedFolderId === folder.id;

  function toggle(e) {
    e.stopPropagation();
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(folder.id) ? next.delete(folder.id) : next.add(folder.id);
      return next;
    });
  }

  return (
    <div className="notes-folder-group">
      {/* Folder row */}
      <div className={`notes-tree-folder${isSelected ? ' active' : ''}`}>
        <button className="notes-folder-toggle" onClick={toggle} title={isExpanded ? 'Collapse' : 'Expand'}>
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button className="notes-folder-label" onClick={() => { setSelectedFolderId(folder.id); if (!isExpanded) setExpandedFolders(prev => new Set([...prev, folder.id])); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={isSelected ? 'rgba(124,58,237,0.2)' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="notes-folder-name">{folder.name}</span>
          <span className="notes-tree-count">{folderNotes.length + childFolders.length}</span>
        </button>
        <div className="notes-folder-row-actions">
          <button className="notes-icon-btn notes-icon-btn-sm" title="New note in folder" onClick={() => onNewNote(folder.id)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <button className="notes-icon-btn notes-icon-btn-sm notes-icon-btn-del" title="Delete folder" onClick={() => onDeleteFolder(folder)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {/* Children */}
      {isExpanded && (
        <div className="notes-folder-children">
          {/* Child folders */}
          {childFolders.map(cf => (
            <FolderTreeItem
              key={cf.id}
              folder={cf}
              allFolders={allFolders}
              notes={notes}
              selectedFolderId={selectedFolderId}
              setSelectedFolderId={setSelectedFolderId}
              expandedFolders={expandedFolders}
              setExpandedFolders={setExpandedFolders}
              activeNoteId={activeNoteId}
              onOpenNote={onOpenNote}
              onNewNote={onNewNote}
              onDeleteFolder={onDeleteFolder}
              onDeleteNote={onDeleteNote}
            />
          ))}
          {/* Notes in folder */}
          {folderNotes.map(note => (
            <button
              key={note.id}
              className={`notes-tree-note${note.id === activeNoteId ? ' active' : ''}`}
              onClick={() => onOpenNote(note)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" />
              </svg>
              <span className="notes-tree-note-title">{note.title || 'Untitled'}</span>
              <button
                className="notes-icon-btn notes-icon-btn-sm notes-icon-btn-del"
                title="Delete note"
                onClick={e => { e.stopPropagation(); onDeleteNote(note); }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
