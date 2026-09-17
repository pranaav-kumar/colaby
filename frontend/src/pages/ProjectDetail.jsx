import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/useAuth';
import {
  getProjectById,
  updateProject,
  deleteProject,
  getProjectMembers,
  requestToJoinProject,
  getProjectInvitations,
  inviteUserToProject,
  acceptInvitation,
  declineInvitation,
  getAllTasks,
  getMyTasks,
  assignTask,
  updateTaskProgress,
  updateTaskStatus,
  deleteTask,
  getDoc,
  upsertDoc,
  createEvent,
  getEvents,
  deleteEvent,
} from '../api/projectApi';
import { extractProjectError } from '../api/projectApi';
import { getProfileById } from '../api/usersApi';

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Project data
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Members
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [memberProfiles, setMemberProfiles] = useState({}); // { userId: profile }

  // Invitations — resolved user profiles for target users
  const [invUserProfiles, setInvUserProfiles] = useState({}); // { userId: profile }

  // Project view toggle: 'dashboard' | 'workspace'
  const [projectView, setProjectView] = useState('dashboard');

  // Join request
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinRequested, setJoinRequested] = useState(false);

  // Edit project form
  const [showEditForm, setShowEditForm] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editGithubUrl, setEditGithubUrl] = useState('');
  const [editTechStack, setEditTechStack] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Tasks (only loaded once — Kanban groups by status client-side)
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskCreating, setTaskCreating] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [taskDeleteLoading, setTaskDeleteLoading] = useState({});

  // Task progress update
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressNote, setProgressNote] = useState('');
  const [progressSaving, setProgressSaving] = useState(false);

  // Kanban drag-and-drop
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [statusMoving, setStatusMoving] = useState({});

  // Documentation
  const [doc, setDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [showDocEditor, setShowDocEditor] = useState(false);
  const [docContent, setDocContent] = useState('');
  const [docSaving, setDocSaving] = useState(false);
  const [docError, setDocError] = useState('');

  // Invitations (creator view)
  const [invitations, setInvitations] = useState([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [invitationActionLoading, setInvitationActionLoading] = useState({});

  // Active section tab
  const [activeSection, setActiveSection] = useState('tasks');

  // Calendar
  const now = new Date();
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [calMonth, setCalMonth] = useState(now.getMonth());    // 0-11
  const [calYear, setCalYear]   = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);      // 'YYYY-MM-DD'
  const [selectedEvent, setSelectedEvent] = useState(null);    // full event object
  const [showEventForm, setShowEventForm] = useState(false);
  const [evtTitle, setEvtTitle]         = useState('');
  const [evtDescription, setEvtDescription] = useState('');
  const [evtStartDate, setEvtStartDate] = useState('');
  const [evtStartTime, setEvtStartTime] = useState('09:00');
  const [evtEndDate, setEvtEndDate]     = useState('');
  const [evtEndTime, setEvtEndTime]     = useState('10:00');
  const [evtVisibility, setEvtVisibility] = useState('ALL');
  const [evtParticipants, setEvtParticipants] = useState([]);
  const [evtCreating, setEvtCreating]   = useState(false);
  const [evtError, setEvtError]         = useState('');
  const [evtDeleteLoading, setEvtDeleteLoading] = useState({});

  const isCreator = project?.createdBy === user?.userId;
  const isMember = project?.isMember === true;

  useEffect(() => {
    loadProject();
  }, [projectId]);

  useEffect(() => {
    if (isMember) {
      loadMembers();
      loadTasks();
      loadDoc();
      loadEvents();
      if (isCreator) {
        loadInvitations();
      }
    }
  }, [project?.isMember, project?.createdBy]);

  async function loadProject() {
    try {
      setLoading(true);
      setError('');
      const response = await getProjectById(projectId);
      setProject(response.data);
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadMembers() {
    try {
      setMembersLoading(true);
      setMembersError('');
      const response = await getProjectMembers(projectId);
      const list = Array.isArray(response.data) ? response.data : [];
      setMembers(list);

      // Resolve display names for members not yet cached
      const unseenIds = list
        .map((m) => m.userId ?? m.id?.userId)
        .filter((id) => id && !memberProfiles[id]);

      if (unseenIds.length > 0) {
        const results = await Promise.allSettled(
          unseenIds.map((id) => getProfileById(id).then((r) => ({ id, profile: r.data })))
        );
        setMemberProfiles((prev) => {
          const next = { ...prev };
          results.forEach((res) => {
            if (res.status === 'fulfilled') next[res.value.id] = res.value.profile;
          });
          return next;
        });
      }
    } catch (err) {
      setMembersError(extractProjectError(err));
    } finally {
      setMembersLoading(false);
    }
  }

  async function loadTasks() {
    try {
      setTasksLoading(true);
      // Creator loads all tasks; members load only their own
      const response = isCreator
        ? await getAllTasks(projectId)
        : await getMyTasks(projectId);
      setTasks(Array.isArray(response.data) ? response.data : []);
    } catch {
      // Non-critical
    } finally {
      setTasksLoading(false);
    }
  }

  async function loadDoc() {
    try {
      setDocLoading(true);
      const response = await getDoc(projectId);
      setDoc(response.data);
    } catch {
      // No doc yet or not a member — ok
    } finally {
      setDocLoading(false);
    }
  }

  async function loadInvitations() {
    try {
      setInvitationsLoading(true);
      const response = await getProjectInvitations(projectId);
      const list = Array.isArray(response.data) ? response.data : [];
      setInvitations(list);

      // Resolve display names for invitation target users
      const unseenIds = list
        .map((inv) => inv.targetUserId)
        .filter((id) => id && !invUserProfiles[id]);
      if (unseenIds.length > 0) {
        const results = await Promise.allSettled(
          unseenIds.map((id) => getProfileById(id).then((r) => ({ id, profile: r.data })))
        );
        setInvUserProfiles((prev) => {
          const next = { ...prev };
          results.forEach((res) => {
            if (res.status === 'fulfilled') next[res.value.id] = res.value.profile;
          });
          return next;
        });
      }
    } catch {
      // Non-critical
    } finally {
      setInvitationsLoading(false);
    }
  }

  // Re-load tasks when membership/creator status resolves
  // (the useEffect above at line 110 handles initial load)

  // ─── Calendar Loaders ────────────────────────────────────

  async function loadEvents() {
    try {
      setEventsLoading(true);
      const response = await getEvents(projectId);
      setEvents(Array.isArray(response.data) ? response.data : []);
    } catch {
      // Non-critical
    } finally {
      setEventsLoading(false);
    }
  }

  // ─── Calendar Handlers ───────────────────────────────────

  async function handleCreateEvent(e) {
    e.preventDefault();
    setEvtError('');

    if (!evtTitle.trim()) { setEvtError('Title is required.'); return; }
    if (!evtStartDate)    { setEvtError('Start date is required.'); return; }
    if (!evtEndDate)      { setEvtError('End date is required.'); return; }
    if (evtVisibility === 'SPECIFIC' && evtParticipants.length === 0) {
      setEvtError('Select at least one participant.'); return;
    }

    const startIso = new Date(`${evtStartDate}T${evtStartTime}:00`).toISOString();
    const endIso   = new Date(`${evtEndDate}T${evtEndTime}:00`).toISOString();
    if (new Date(endIso) <= new Date(startIso)) {
      setEvtError('End must be after start.'); return;
    }

    setEvtCreating(true);
    try {
      const response = await createEvent(projectId, {
        title: evtTitle.trim(),
        description: evtDescription.trim() || null,
        startTime: startIso,
        endTime: endIso,
        visibility: evtVisibility,
        participantIds: evtVisibility === 'SPECIFIC' ? evtParticipants : [],
      });
      setEvents((prev) => [...prev, response.data]);
      // Reset form
      setEvtTitle(''); setEvtDescription('');
      setEvtStartDate(''); setEvtStartTime('09:00');
      setEvtEndDate(''); setEvtEndTime('10:00');
      setEvtVisibility('ALL'); setEvtParticipants([]);
      setShowEventForm(false);
    } catch (err) {
      setEvtError(extractProjectError(err));
    } finally {
      setEvtCreating(false);
    }
  }

  async function handleDeleteEvent(eventId) {
    if (!window.confirm('Delete this event?')) return;
    setEvtDeleteLoading((prev) => ({ ...prev, [eventId]: true }));
    try {
      await deleteEvent(projectId, eventId);
      setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
      if (selectedEvent?.id === eventId) setSelectedEvent(null);
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setEvtDeleteLoading((prev) => ({ ...prev, [eventId]: false }));
    }
  }

  function toggleEvtParticipant(uid) {
    setEvtParticipants((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  // ─── Calendar Utilities ──────────────────────────────────

  function toLocalISODate(isoString) {
    // Convert ISO to YYYY-MM-DD in local time
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatEventTime(isoString) {
    return new Date(isoString).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function formatEventDate(isoString) {
    return new Date(isoString).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const cells = [];
    // Previous month trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), currentMonth: false });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), currentMonth: true });
    }
    // Next month leading days — fill to complete last row
    let next = 1;
    while (cells.length % 7 !== 0) {
      cells.push({ date: new Date(year, month + 1, next++), currentMonth: false });
    }
    return cells;
  }

  function eventsOnDay(dateObj) {
    const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    return events.filter((ev) => toLocalISODate(ev.startTime) === key);
  }

  // ─── Project Actions ─────────────────────────────────────


  function openEditForm() {
    setEditName(project.name || '');
    setEditDescription(project.description || '');
    setEditGithubUrl(project.githubRepoUrl || '');
    setEditTechStack(project.techStack || '');
    setEditStatus(project.status || 'ACTIVE');
    setEditError('');
    setShowEditForm(true);
  }

  async function handleUpdateProject(e) {
    e.preventDefault();
    setEditError('');
    setEditSaving(true);
    try {
      const response = await updateProject(projectId, {
        name: editName.trim() || null,
        description: editDescription.trim() || null,
        githubRepoUrl: editGithubUrl.trim() || null,
        techStack: editTechStack.trim() || null,
        status: editStatus,
      });
      setProject(response.data);
      setShowEditForm(false);
    } catch (err) {
      setEditError(extractProjectError(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteProject() {
    if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;
    setDeleteLoading(true);
    try {
      await deleteProject(projectId);
      navigate('/projects');
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleRequestToJoin() {
    setJoinLoading(true);
    try {
      await requestToJoinProject(projectId);
      setJoinRequested(true);
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setJoinLoading(false);
    }
  }

  // ─── Task Actions ────────────────────────────────────────

  async function handleAssignTask(e) {
    e.preventDefault();
    setTaskError('');

    if (!taskTitle.trim()) {
      setTaskError('Task title is required.');
      return;
    }
    if (!taskAssignee.trim()) {
      setTaskError('Please select a member to assign.');
      return;
    }

    setTaskCreating(true);
    try {
      const response = await assignTask(projectId, {
        assignedTo: taskAssignee,
        title: taskTitle.trim(),
        description: taskDescription.trim() || null,
      });
      setTasks((prev) => [response.data, ...prev]);
      setTaskTitle('');
      setTaskDescription('');
      setTaskAssignee('');
      setShowTaskForm(false);
    } catch (err) {
      setTaskError(extractProjectError(err));
    } finally {
      setTaskCreating(false);
    }
  }

  function openProgressEditor(task) {
    setEditingTaskId(task.id);
    setProgressPercent(task.progressPercent);
    setProgressNote(task.progressNote || '');
  }

  async function handleUpdateProgress(taskId) {
    setProgressSaving(true);
    try {
      const response = await updateTaskProgress(projectId, taskId, {
        progressPercent,
        progressNote: progressNote.trim() || null,
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? response.data : t))
      );
      setEditingTaskId(null);
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setProgressSaving(false);
    }
  }

  async function handleDeleteTask(taskId) {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    setTaskDeleteLoading((prev) => ({ ...prev, [taskId]: true }));
    try {
      await deleteTask(projectId, taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setTaskDeleteLoading((prev) => ({ ...prev, [taskId]: false }));
    }
  }

  // ─── Kanban DnD handlers ─────────────────────────────────

  function handleDragStart(e, taskId) {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, column) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(column);
  }

  function handleDragLeave() {
    setDragOverColumn(null);
  }

  async function handleDrop(e, targetStatus) {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTaskId) return;

    const task = tasks.find((t) => t.id === draggedTaskId);
    if (!task || task.status === targetStatus) {
      setDraggedTaskId(null);
      return;
    }

    setStatusMoving((prev) => ({ ...prev, [draggedTaskId]: true }));
    const id = draggedTaskId;
    setDraggedTaskId(null);
    try {
      const response = await updateTaskStatus(projectId, id, targetStatus);
      setTasks((prev) => prev.map((t) => (t.id === id ? response.data : t)));
      // Close progress editor if open for this task
      if (editingTaskId === id) setEditingTaskId(null);
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setStatusMoving((prev) => ({ ...prev, [id]: false }));
    }
  }

  // ─── Doc Actions ─────────────────────────────────────────

  function openDocEditor() {
    setDocContent(doc?.content || '');
    setDocError('');
    setShowDocEditor(true);
  }

  async function handleSaveDoc(e) {
    e.preventDefault();
    setDocError('');
    setDocSaving(true);
    try {
      const response = await upsertDoc(projectId, {
        content: docContent,
      });
      setDoc(response.data);
      setShowDocEditor(false);
    } catch (err) {
      setDocError(extractProjectError(err));
    } finally {
      setDocSaving(false);
    }
  }

  // ─── Invitation Actions ──────────────────────────────────

  async function handleInviteUser(e) {
    e.preventDefault();
    setInviteError('');

    if (!inviteUserId.trim()) {
      setInviteError('User ID is required.');
      return;
    }

    setInviteSending(true);
    try {
      const response = await inviteUserToProject(projectId, inviteUserId.trim());
      setInvitations((prev) => [response.data, ...prev]);
      setInviteUserId('');
      setShowInviteForm(false);
    } catch (err) {
      setInviteError(extractProjectError(err));
    } finally {
      setInviteSending(false);
    }
  }

  async function handleAcceptInvitation(invitationId) {
    setInvitationActionLoading((prev) => ({ ...prev, [invitationId]: true }));
    try {
      await acceptInvitation(invitationId);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      loadMembers();
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setInvitationActionLoading((prev) => ({ ...prev, [invitationId]: false }));
    }
  }

  async function handleDeclineInvitation(invitationId) {
    setInvitationActionLoading((prev) => ({ ...prev, [invitationId]: true }));
    try {
      await declineInvitation(invitationId);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setInvitationActionLoading((prev) => ({ ...prev, [invitationId]: false }));
    }
  }

  // ─── Helpers ─────────────────────────────────────────────

  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }

  function getStatusClass(status) {
    switch (status) {
      case 'ACTIVE': return 'status-active';
      case 'COMPLETED': return 'status-completed';
      case 'ARCHIVED': return 'status-archived';
      default: return '';
    }
  }

  function getTaskStatusClass(status) {
    switch (status) {
      case 'TODO': return 'task-status-todo';
      case 'IN_PROGRESS': return 'task-status-progress';
      case 'DONE': return 'task-status-done';
      default: return '';
    }
  }

  function getMemberUserId(member) {
    return member.userId ?? member.id?.userId ?? '';
  }

  function getMemberDisplayName(member) {
    const uid = getMemberUserId(member);
    if (uid === user?.userId) return 'You';
    // Use resolved profile name if available
    const profile = memberProfiles[uid];
    if (profile?.fullName) return profile.fullName;
    if (profile?.userName) return profile.userName;
    // Also check backend-enriched fields (MemberResponse includes userName/fullName directly)
    if (member.fullName) return member.fullName;
    if (member.userName) return member.userName;
    return uid ? uid.slice(0, 8) + '...' : 'Unknown';
  }

  function getMemberName(userId) {
    if (userId === user?.userId) return 'You';
    const profile = memberProfiles[userId];
    if (profile?.fullName) return profile.fullName;
    if (profile?.userName) return profile.userName;
    return userId ? userId.slice(0, 8) + '...' : 'Unknown';
  }

  return (
    <div className="page-layout project-detail-page">
      <Navbar />

      <div className="project-page-shell">
        {loading ? (
          <div className="loading-container" style={{ width: '100%', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" style={{ width: 36, height: 36 }} />
            <p className="text-secondary" style={{ marginTop: 12 }}>Loading project...</p>
          </div>
        ) : error && !project ? (
          <div style={{ width: '100%', padding: 40, maxWidth: 640, margin: '40px auto' }}>
            <div className="message message-error">{error}</div>
          </div>
        ) : project ? (
          <>
            {/* ── LEFT SIDEBAR (Red Highlighted Area) ── */}
            {isMember && (
              <aside className="project-sidebar">
                {/* Dashboard / Workspace switch at top */}
                <div className="project-sidebar-views">
                  <button
                    type="button"
                    id="project-view-dashboard-btn"
                    className={`project-sidebar-view-btn${projectView === 'dashboard' ? ' active' : ''}`}
                    onClick={() => setProjectView('dashboard')}
                    title="Project Dashboard"
                    aria-label="Project Dashboard"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    id="project-view-workspace-btn"
                    className={`project-sidebar-view-btn${projectView === 'workspace' ? ' active' : ''}`}
                    onClick={() => setProjectView('workspace')}
                    title="Project Workspace"
                    aria-label="Project Workspace"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                    </svg>
                  </button>
                </div>

                <div className="project-sidebar-divider" />

                {/* Section nav icons for Dashboard */}
                {projectView === 'dashboard' && (
                  <nav className="project-sidebar-nav">
                    <button
                      type="button"
                      className={`project-sidebar-nav-item${activeSection === 'tasks' ? ' active' : ''}`}
                      onClick={() => setActiveSection('tasks')}
                      title="Tasks"
                      aria-label="Tasks"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"/><rect x="3" y="13" width="6" height="6" rx="1"/><path d="M13 6h8M13 10h5M13 14h8M13 18h5"/></svg>
                    </button>
                    <button
                      type="button"
                      className={`project-sidebar-nav-item${activeSection === 'members' ? ' active' : ''}`}
                      onClick={() => setActiveSection('members')}
                      title="Members"
                      aria-label="Members"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      {members.length > 0 && <span className="sidebar-icon-dot" />}
                    </button>
                    <button
                      type="button"
                      className={`project-sidebar-nav-item${activeSection === 'docs' ? ' active' : ''}`}
                      onClick={() => setActiveSection('docs')}
                      title="Documentation"
                      aria-label="Documentation"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </button>
                    <button
                      type="button"
                      className={`project-sidebar-nav-item${activeSection === 'calendar' ? ' active' : ''}`}
                      onClick={() => setActiveSection('calendar')}
                      title="Calendar"
                      aria-label="Calendar"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </button>
                    {isCreator && (
                      <button
                        type="button"
                        className={`project-sidebar-nav-item${activeSection === 'invitations' ? ' active' : ''}`}
                        onClick={() => setActiveSection('invitations')}
                        title="Invitations"
                        aria-label="Invitations"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        {invitations.length > 0 && <span className="sidebar-icon-dot sidebar-icon-dot-alert" />}
                      </button>
                    )}
                  </nav>
                )}
              </aside>
            )}

            {/* ── MAIN AREA (Topbar on top, Content below) ── */}
            <div className="project-main-area">
              {/* ── PROJECT TOPBAR (White Highlighted Area with Yellow Circled items) ── */}
              <header className="project-topbar">
                <div className="project-topbar-left">
                  <Link to="/projects" className="project-topbar-back">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                    Projects
                  </Link>
                  <div className="project-topbar-sep" />
                  <h1 className="project-topbar-name">{project.name}</h1>
                  <span className={`project-status-badge ${getStatusClass(project.status)}`}>{project.status}</span>
                  <div className="project-topbar-stats">
                    <span className="project-topbar-stat">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: 4 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                      {project.memberCount} {project.memberCount === 1 ? 'member' : 'members'}
                    </span>
                    {project.techStack && (
                      <span className="project-topbar-stat">{project.techStack}</span>
                    )}
                    {project.githubRepoUrl && (
                      <a href={project.githubRepoUrl} target="_blank" rel="noopener noreferrer" className="project-topbar-stat project-topbar-link">
                        GitHub
                      </a>
                    )}
                    <span className="project-topbar-stat project-topbar-date">Created {formatDate(project.createdAt)}</span>
                  </div>
                </div>
                <div className="project-topbar-actions">
                  {isMember && !isCreator && <span className="project-member-badge">Member</span>}
                  {isCreator && (
                    <>
                      <button type="button" className="btn-edit-profile" onClick={() => showEditForm ? setShowEditForm(false) : openEditForm()} id="edit-project-btn">
                        {showEditForm ? 'Cancel Edit' : 'Edit Project'}
                      </button>
                      <button type="button" className="btn-community-leave" onClick={handleDeleteProject} disabled={deleteLoading} id="delete-project-btn">
                        {deleteLoading ? 'Deleting...' : 'Delete'}
                      </button>
                    </>
                  )}
                  {!isMember && !joinRequested && (
                    <button type="button" className="btn-community-join" onClick={handleRequestToJoin} disabled={joinLoading} id="join-project-btn">
                      {joinLoading ? 'Requesting...' : 'Request to Join'}
                    </button>
                  )}
                  {!isMember && joinRequested && <span className="project-requested-badge">Request Sent</span>}
                </div>
              </header>

              {/* ── BODY CONTENT ── */}
              <div className="project-body-content">
                {error && <div className="message message-error" style={{ marginBottom: 16 }}>{error}</div>}

                {/* Edit Project Form */}
                {showEditForm && isCreator && (
                <div className="community-create-card" style={{ marginBottom: 24 }}>
                  <h2 className="card-title">Edit Project</h2>
                  <form onSubmit={handleUpdateProject} className="community-create-form">
                    {editError && (
                      <div className="message message-error">{editError}</div>
                    )}
                    <div className="input-group">
                      <label htmlFor="edit-project-name" className="input-label">
                        Project Name
                      </label>
                      <input
                        id="edit-project-name"
                        type="text"
                        className="input-field"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={editSaving}
                        maxLength={100}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="edit-project-desc" className="input-label">
                        Description
                      </label>
                      <textarea
                        id="edit-project-desc"
                        className="input-field textarea-field"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        disabled={editSaving}
                        rows={3}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="edit-project-github" className="input-label">
                        GitHub Repository URL
                      </label>
                      <input
                        id="edit-project-github"
                        type="url"
                        className="input-field"
                        value={editGithubUrl}
                        onChange={(e) => setEditGithubUrl(e.target.value)}
                        disabled={editSaving}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="edit-project-tech" className="input-label">
                        Tech Stack
                      </label>
                      <input
                        id="edit-project-tech"
                        type="text"
                        className="input-field"
                        value={editTechStack}
                        onChange={(e) => setEditTechStack(e.target.value)}
                        disabled={editSaving}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="edit-project-status" className="input-label">
                        Status
                      </label>
                      <select
                        id="edit-project-status"
                        className="input-field"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        disabled={editSaving}
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="ARCHIVED">Archived</option>
                      </select>
                    </div>
                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn-primary btn-save"
                        disabled={editSaving}
                        id="save-project-btn"
                      >
                        <span className="btn-content">
                          {editSaving && <span className="spinner" />}
                          {editSaving ? 'Saving...' : 'Save Changes'}
                        </span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

                {/* Non-member info */}
                {!isMember && (
                  <div className="community-create-card" style={{ maxWidth: 640, margin: '40px auto', textAlign: 'center', padding: '36px 32px' }}>
                    <h2 className="card-title" style={{ marginBottom: 12 }}>About {project.name}</h2>
                    <p className="text-secondary" style={{ marginBottom: 24, lineHeight: 1.6 }}>
                      {project.description || 'No description provided.'}
                    </p>
                    {!joinRequested ? (
                      <button type="button" className="btn-community-join" onClick={handleRequestToJoin} disabled={joinLoading} style={{ padding: '10px 24px', fontSize: '0.95rem' }}>
                        {joinLoading ? 'Requesting...' : 'Request to Join Project'}
                      </button>
                    ) : (
                      <span className="project-requested-badge" style={{ fontSize: '0.9rem', padding: '8px 18px' }}>Request Sent — Awaiting Creator Approval</span>
                    )}
                  </div>
                )}

                {/* Member-only views */}
                {isMember && (
                  <>
                    {/* Workspace placeholder */}
                    {projectView === 'workspace' && (
                      <div className="project-dashboard-placeholder">
                        <h3 className="project-dashboard-title">Project Workspace</h3>
                        <p className="project-dashboard-desc">Your workspace area. Content coming soon.</p>
                      </div>
                    )}

                    {projectView === 'dashboard' && (
                      <>
                        {/* TASKS — KANBAN BOARD */}
                  {activeSection === 'tasks' && (() => {
                    const COLUMNS = [
                      { key: 'PENDING', label: 'Pending' },
                      { key: 'ONGOING', label: 'Ongoing' },
                      { key: 'DONE',    label: 'Done' },
                    ];
                    const tasksByStatus = (status) =>
                      tasks.filter((t) => t.status === status);

                    return (
                      <div className="project-section">
                        {/* Header row */}
                        <div className="project-section-header">
                          <h3 className="section-title">Task Board</h3>
                          {isCreator && (
                            <button
                              type="button"
                              className="btn-edit-profile"
                              onClick={() => {
                                setShowTaskForm(!showTaskForm);
                                setTaskError('');
                              }}
                              id="assign-task-btn"
                            >
                              {showTaskForm ? 'Cancel' : '+ Assign Task'}
                            </button>
                          )}
                        </div>

                        {/* Assign Task Form */}
                        {showTaskForm && isCreator && (
                          <div className="community-create-card" style={{ marginBottom: 20 }}>
                            <h3 className="card-title">Assign a Task</h3>
                            <form onSubmit={handleAssignTask} className="community-create-form">
                              {taskError && (
                                <div className="message message-error">{taskError}</div>
                              )}
                              <div className="input-group">
                                <label htmlFor="task-assignee" className="input-label">Assign To</label>
                                <select
                                  id="task-assignee"
                                  className="input-field"
                                  value={taskAssignee}
                                  onChange={(e) => setTaskAssignee(e.target.value)}
                                  disabled={taskCreating}
                                >
                                  <option value="">Select a member</option>
                                  {members.map((m) => {
                                    const mUid = getMemberUserId(m);
                                    const mName = getMemberDisplayName(m);
                                    return (
                                      <option key={mUid} value={mUid}>
                                        {mName} ({m.role})
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                              <div className="input-group">
                                <label htmlFor="task-title" className="input-label">Task Title</label>
                                <input
                                  id="task-title"
                                  type="text"
                                  className="input-field"
                                  placeholder="e.g. Implement user authentication"
                                  value={taskTitle}
                                  onChange={(e) => setTaskTitle(e.target.value)}
                                  disabled={taskCreating}
                                  maxLength={200}
                                />
                              </div>
                              <div className="input-group">
                                <label htmlFor="task-desc" className="input-label">Description</label>
                                <textarea
                                  id="task-desc"
                                  className="input-field textarea-field"
                                  placeholder="Task details..."
                                  value={taskDescription}
                                  onChange={(e) => setTaskDescription(e.target.value)}
                                  disabled={taskCreating}
                                  rows={3}
                                />
                              </div>
                              <div className="form-actions">
                                <button
                                  type="submit"
                                  className="btn-primary btn-save"
                                  disabled={taskCreating || !taskTitle.trim() || !taskAssignee}
                                  id="submit-task-btn"
                                >
                                  <span className="btn-content">
                                    {taskCreating && <span className="spinner" />}
                                    {taskCreating ? 'Assigning...' : 'Assign Task'}
                                  </span>
                                </button>
                              </div>
                            </form>
                          </div>
                        )}

                        {/* Kanban Board */}
                        {tasksLoading ? (
                          <div className="loading-container">
                            <div className="spinner" style={{ width: 28, height: 28 }} />
                            <p className="text-secondary">Loading tasks...</p>
                          </div>
                        ) : (
                          <div className="kanban-board">
                            {COLUMNS.map((col) => {
                              const colTasks = tasksByStatus(col.key);
                              const isOver = dragOverColumn === col.key;
                              return (
                                <div
                                  key={col.key}
                                  className={`kanban-column kanban-col-${col.key.toLowerCase()}${isOver ? ' kanban-col-drop-over' : ''}`}
                                  onDragOver={(e) => handleDragOver(e, col.key)}
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) => handleDrop(e, col.key)}
                                >
                                  {/* Column header */}
                                  <div className="kanban-column-header">
                                    <span className="kanban-col-label">{col.label}</span>
                                    <span className="kanban-col-count">{colTasks.length}</span>
                                  </div>

                                  {/* Cards */}
                                  <div className="kanban-cards">
                                    {colTasks.length === 0 ? (
                                      <div className="kanban-empty-col">
                                        {isOver
                                          ? 'Drop here'
                                          : col.key === 'PENDING'
                                          ? isCreator ? 'Assign a task to get started' : 'No pending tasks'
                                          : col.key === 'ONGOING'
                                          ? 'No tasks in progress'
                                          : 'No completed tasks yet'}
                                      </div>
                                    ) : (
                                      colTasks.map((task) => {
                                        const canEdit =
                                          task.assignedTo === user?.userId || isCreator;
                                        const isMoving = !!statusMoving[task.id];
                                        const isEditingThis = editingTaskId === task.id;
                                        return (
                                          <div
                                            key={task.id}
                                            className={`kanban-card kanban-card-${col.key.toLowerCase()}${isMoving ? ' kanban-card-moving' : ''}`}
                                            draggable={canEdit}
                                            onDragStart={(e) => canEdit && handleDragStart(e, task.id)}
                                            onDragEnd={() => setDraggedTaskId(null)}
                                          >
                                            {/* Card top row */}
                                            <div className="kanban-card-top">
                                              <h4 className="kanban-card-title">{task.title}</h4>
                                              {isCreator && (
                                                <button
                                                  type="button"
                                                  className="kanban-delete-btn"
                                                  onClick={() => handleDeleteTask(task.id)}
                                                  disabled={taskDeleteLoading[task.id]}
                                                  title="Delete task"
                                                >
                                                  {taskDeleteLoading[task.id] ? '…' : '×'}
                                                </button>
                                              )}
                                            </div>

                                            {/* Assignee */}
                                            <div className="kanban-card-assignee">
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> {getMemberName(task.assignedTo)}
                                            </div>

                                            {/* Description snippet */}
                                            {task.description && (
                                              <p className="kanban-card-desc">{task.description}</p>
                                            )}

                                            {/* Progress bar (always visible on ongoing/done) */}
                                            {(col.key === 'ONGOING' || col.key === 'DONE') && (
                                              <div className="kanban-progress-wrap">
                                                <div className="kanban-progress-bar">
                                                  <div
                                                    className="kanban-progress-fill"
                                                    style={{ width: `${task.progressPercent}%` }}
                                                  />
                                                </div>
                                                <span className="kanban-progress-pct">
                                                  {task.progressPercent}%
                                                </span>
                                              </div>
                                            )}

                                            {/* Progress note */}
                                            {task.progressNote && col.key !== 'PENDING' && (
                                              <p className="kanban-progress-note"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> {task.progressNote}</p>
                                            )}

                                            {/* Progress editor — ONGOING only, for assignee */}
                                            {col.key === 'ONGOING' && task.assignedTo === user?.userId && (
                                              <>
                                                {!isEditingThis ? (
                                                  <button
                                                    type="button"
                                                    className="kanban-edit-progress-btn"
                                                    onClick={() => {
                                                      setEditingTaskId(task.id);
                                                      setProgressPercent(task.progressPercent);
                                                      setProgressNote(task.progressNote || '');
                                                    }}
                                                  >
                                                    Update Progress
                                                  </button>
                                                ) : (
                                                  <div className="kanban-progress-editor">
                                                    <label className="kanban-editor-label">
                                                      Progress: <strong>{progressPercent}%</strong>
                                                    </label>
                                                    <input
                                                      type="range"
                                                      min="0"
                                                      max="99"
                                                      value={progressPercent}
                                                      onChange={(e) =>
                                                        setProgressPercent(Number(e.target.value))
                                                      }
                                                      className="progress-slider"
                                                      disabled={progressSaving}
                                                    />
                                                    <textarea
                                                      className="input-field kanban-note-field"
                                                      placeholder="What part did you complete?"
                                                      value={progressNote}
                                                      onChange={(e) => setProgressNote(e.target.value)}
                                                      disabled={progressSaving}
                                                      rows={2}
                                                    />
                                                    <div className="kanban-editor-actions">
                                                      <button
                                                        type="button"
                                                        className="btn-primary btn-sm"
                                                        onClick={() => handleUpdateProgress(task.id)}
                                                        disabled={progressSaving}
                                                      >
                                                        {progressSaving ? 'Saving…' : 'Save'}
                                                      </button>
                                                      <button
                                                        type="button"
                                                        className="btn-secondary btn-sm"
                                                        onClick={() => setEditingTaskId(null)}
                                                        disabled={progressSaving}
                                                      >
                                                        Cancel
                                                      </button>
                                                    </div>
                                                  </div>
                                                )}
                                              </>
                                            )}

                                            {/* Moving indicator */}
                                            {isMoving && (
                                              <div className="kanban-moving-overlay">Moving…</div>
                                            )}
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ─── MEMBERS SECTION ──────────────────────── */}
                  {activeSection === 'members' && (
                    <div className="project-section">
                      {membersLoading ? (
                        <div className="loading-container">
                          <div className="spinner" style={{ width: 28, height: 28 }} />
                          <p className="text-secondary">Loading members...</p>
                        </div>
                      ) : membersError ? (
                        <div className="message message-error">{membersError}</div>
                      ) : members.length === 0 ? (
                        <div className="empty-state">
                          <h3 className="empty-title">No members</h3>
                          <p className="empty-desc">No project members found.</p>
                        </div>
                      ) : (
                        <div className="members-list">
                          {members.map((member) => {
                            const uid = getMemberUserId(member);
                            const displayName = getMemberDisplayName(member);
                            return (
                            <div key={uid || member.role} className="member-item">
                              <div className="member-info">
                                <Link
                                  to={`/users/${uid}`}
                                  className="member-link"
                                >
                                  {displayName}
                                </Link>
                                <span className={`member-role-badge ${member.role === 'CREATOR' ? 'role-creator' : 'role-member'}`}>
                                  {member.role}
                                </span>
                              </div>
                              <div className="member-id-row">
                                <span className="member-userid-text">ID: {uid ? `${uid.slice(0, 8)}…` : '—'}</span>
                                <span className="member-joined">
                                  Joined {formatDate(member.joinedAt)}
                                </span>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── DOCUMENTATION SECTION ────────────────── */}
                  {activeSection === 'docs' && (
                    <div className="project-section">
                      <div className="project-section-header">
                        <h3 className="section-title">Project Documentation</h3>
                        {isCreator && (
                          <button
                            type="button"
                            className="btn-edit-profile"
                            onClick={() => showDocEditor ? setShowDocEditor(false) : openDocEditor()}
                            id="edit-doc-btn"
                          >
                            {showDocEditor ? 'Cancel' : 'Edit Documentation'}
                          </button>
                        )}
                      </div>

                      {showDocEditor && isCreator ? (
                        <div className="community-create-card">
                          <form onSubmit={handleSaveDoc} className="community-create-form">
                            {docError && (
                              <div className="message message-error">{docError}</div>
                            )}
                            <div className="input-group">
                              <label htmlFor="doc-content" className="input-label">
                                Documentation Content
                              </label>
                              <textarea
                                id="doc-content"
                                className="input-field textarea-field doc-textarea"
                                placeholder="Write your project documentation here..."
                                value={docContent}
                                onChange={(e) => setDocContent(e.target.value)}
                                disabled={docSaving}
                                rows={12}
                              />
                            </div>
                            <div className="form-actions">
                              <button
                                type="submit"
                                className="btn-primary btn-save"
                                disabled={docSaving}
                                id="save-doc-btn"
                              >
                                <span className="btn-content">
                                  {docSaving && <span className="spinner" />}
                                  {docSaving ? 'Saving...' : 'Save Documentation'}
                                </span>
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : docLoading ? (
                        <div className="loading-container">
                          <div className="spinner" style={{ width: 28, height: 28 }} />
                          <p className="text-secondary">Loading documentation...</p>
                        </div>
                      ) : doc?.content ? (
                        <div className="doc-viewer">
                          <pre className="doc-content">{doc.content}</pre>
                          {doc.updatedAt && (
                            <p className="doc-meta">
                              Last updated {formatDate(doc.updatedAt)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="empty-state">
                          <h3 className="empty-title">No documentation yet</h3>
                          <p className="empty-desc">
                            {isCreator
                              ? 'Add documentation to help your team get started.'
                              : 'The project creator has not added documentation yet.'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── INVITATIONS SECTION (Creator Only) ───── */}
                  {activeSection === 'invitations' && isCreator && (
                    <div className="project-section">
                      <div className="project-section-header">
                        <h3 className="section-title">Pending Invitations</h3>
                        <button
                          type="button"
                          className="btn-edit-profile"
                          onClick={() => {
                            setShowInviteForm(!showInviteForm);
                            setInviteError('');
                          }}
                          id="invite-user-btn"
                        >
                          {showInviteForm ? 'Cancel' : '+ Invite User'}
                        </button>
                      </div>

                      {/* Invite User Form */}
                      {showInviteForm && (
                        <div className="community-create-card" style={{ marginBottom: 16 }}>
                          <h3 className="card-title">Invite a User</h3>
                          <form onSubmit={handleInviteUser} className="community-create-form">
                            {inviteError && (
                              <div className="message message-error">{inviteError}</div>
                            )}
                            <div className="input-group">
                              <label htmlFor="invite-user-id" className="input-label">
                                User ID
                              </label>
                              <input
                                id="invite-user-id"
                                type="text"
                                className="input-field"
                                placeholder="Enter the user's UUID"
                                value={inviteUserId}
                                onChange={(e) => setInviteUserId(e.target.value)}
                                disabled={inviteSending}
                              />
                            </div>
                            <div className="form-actions">
                              <button
                                type="submit"
                                className="btn-primary btn-save"
                                disabled={inviteSending || !inviteUserId.trim()}
                                id="submit-invite-btn"
                              >
                                <span className="btn-content">
                                  {inviteSending && <span className="spinner" />}
                                  {inviteSending ? 'Sending...' : 'Send Invitation'}
                                </span>
                              </button>
                            </div>
                          </form>
                        </div>
                      )}

                      {/* Invitations List */}
                      {invitationsLoading ? (
                        <div className="loading-container">
                          <div className="spinner" style={{ width: 28, height: 28 }} />
                          <p className="text-secondary">Loading invitations...</p>
                        </div>
                      ) : invitations.length === 0 ? (
                        <div className="empty-state">
                          <h3 className="empty-title">No pending invitations</h3>
                          <p className="empty-desc">
                            Invite users or wait for join requests.
                          </p>
                        </div>
                      ) : (
                        <div className="invitations-list">
                          {invitations.map((inv) => (
                            <div key={inv.id} className="invitation-card">
                              <div className="invitation-info">
                                <span className={`invitation-type-badge ${inv.type === 'JOIN_REQUEST' ? 'type-join-request' : 'type-invite'}`}>
                                  {inv.type === 'JOIN_REQUEST' ? 'Join Request' : 'Invitation'}
                                </span>
                                <span className="invitation-meta">
                                  <Link to={`/users/${inv.targetUserId}`} className="member-link">
                                    {(() => {
                                      const p = invUserProfiles[inv.targetUserId];
                                      return p?.fullName || p?.userName || `${inv.targetUserId.slice(0, 8)}...`;
                                    })()}
                                  </Link>
                                </span>
                                <span className="invitation-meta">
                                  {formatDate(inv.createdAt)}
                                </span>
                              </div>
                              {inv.type === 'JOIN_REQUEST' && (
                                <div className="invitation-actions">
                                  <button
                                    type="button"
                                    className="btn-community-join"
                                    onClick={() => handleAcceptInvitation(inv.id)}
                                    disabled={invitationActionLoading[inv.id]}
                                  >
                                    {invitationActionLoading[inv.id] ? 'Accepting...' : 'Accept'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-community-leave"
                                    onClick={() => handleDeclineInvitation(inv.id)}
                                    disabled={invitationActionLoading[inv.id]}
                                  >
                                    {invitationActionLoading[inv.id] ? 'Declining...' : 'Decline'}
                                  </button>
                                </div>
                              )}
                              {inv.type === 'INVITE' && (
                                <span className="invitation-pending-badge">Pending</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── CALENDAR SECTION ──────────────────────── */}
                  {activeSection === 'calendar' && (() => {
                    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                    const calDays = getCalendarDays(calYear, calMonth);

                    function prevMonth() {
                      if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
                      else { setCalMonth(calMonth - 1); }
                      setSelectedDate(null); setSelectedEvent(null);
                    }
                    function nextMonth() {
                      if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
                      else { setCalMonth(calMonth + 1); }
                      setSelectedDate(null); setSelectedEvent(null);
                    }
                    function goToday() {
                      setCalMonth(now.getMonth()); setCalYear(now.getFullYear());
                      setSelectedDate(todayKey); setSelectedEvent(null);
                    }

                    const selectedDayEvents = selectedDate
                      ? events.filter((ev) => toLocalISODate(ev.startTime) === selectedDate)
                      : [];

                    return (
                      <div className="project-section">
                        <div className="project-section-header">
                          <h3 className="section-title">Calendar</h3>
                          {isCreator && (
                            <button
                              type="button"
                              className="btn-edit-profile"
                              onClick={() => {
                                setShowEventForm(true);
                                setEvtError('');
                              }}
                              id="schedule-event-btn"
                            >
                              + Schedule Event
                            </button>
                          )}
                        </div>

                        {eventsLoading ? (
                          <div className="loading-container">
                            <div className="spinner" style={{ width: 28, height: 28 }} />
                            <p className="text-secondary">Loading calendar...</p>
                          </div>
                        ) : (
                          <div className="cal-layout">
                            {/* Calendar grid */}
                            <div className="cal-main">
                              {/* Month header */}
                              <div className="cal-header">
                                <button type="button" className="cal-nav-btn" onClick={prevMonth} title="Previous month">&lsaquo;</button>
                                <h4 className="cal-month-title">{monthNames[calMonth]} {calYear}</h4>
                                <button type="button" className="cal-nav-btn" onClick={nextMonth} title="Next month">&rsaquo;</button>
                                <button type="button" className="cal-today-btn" onClick={goToday}>Today</button>
                              </div>

                              {/* Weekday headers */}
                              <div className="cal-grid cal-weekday-row">
                                {dayNames.map((d) => (
                                  <div key={d} className="cal-weekday">{d}</div>
                                ))}
                              </div>

                              {/* Day cells */}
                              <div className="cal-grid">
                                {calDays.map((cell, idx) => {
                                  const cellKey = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(cell.date.getDate()).padStart(2, '0')}`;
                                  const dayEvts = eventsOnDay(cell.date);
                                  const isToday = cellKey === todayKey;
                                  const isSelected = cellKey === selectedDate;

                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      className={[
                                        'cal-day',
                                        !cell.currentMonth && 'cal-day-other',
                                        isToday && 'cal-day-today',
                                        isSelected && 'cal-day-selected',
                                      ].filter(Boolean).join(' ')}
                                      onClick={() => { setSelectedDate(cellKey); setSelectedEvent(null); }}
                                    >
                                      <span className="cal-day-num">{cell.date.getDate()}</span>
                                      {dayEvts.length > 0 && (
                                        <div className="cal-day-dots">
                                          {dayEvts.slice(0, 3).map((ev) => (
                                            <span
                                              key={ev.id}
                                              className={`cal-dot${ev.visibility === 'SPECIFIC' ? ' cal-dot-specific' : ''}`}
                                              title={ev.title}
                                            />
                                          ))}
                                          {dayEvts.length > 3 && <span className="cal-dot-more">+{dayEvts.length - 3}</span>}
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Side panel — events for selected day */}
                            <div className={`cal-side-panel${selectedDate ? ' cal-side-open' : ''}`}>
                              {selectedDate && (
                                <>
                                  {selectedEvent ? (
                                    /* Event detail */
                                    <div className="cal-event-detail">
                                      <button
                                        type="button"
                                        className="cal-back-btn"
                                        onClick={() => setSelectedEvent(null)}
                                      >
                                        &larr; Back
                                      </button>
                                      <h4 className="cal-detail-title">{selectedEvent.title}</h4>
                                      <div className="cal-detail-meta">
                                        <div className="cal-detail-row">
                                          <span className="cal-detail-label">Start</span>
                                          <span>{formatEventDate(selectedEvent.startTime)} at {formatEventTime(selectedEvent.startTime)}</span>
                                        </div>
                                        <div className="cal-detail-row">
                                          <span className="cal-detail-label">End</span>
                                          <span>{formatEventDate(selectedEvent.endTime)} at {formatEventTime(selectedEvent.endTime)}</span>
                                        </div>
                                        <div className="cal-detail-row">
                                          <span className="cal-detail-label">Visibility</span>
                                          <span className={`cal-vis-badge cal-vis-${selectedEvent.visibility.toLowerCase()}`}>
                                            {selectedEvent.visibility === 'ALL' ? 'All Members' : 'Specific Members'}
                                          </span>
                                        </div>
                                        {selectedEvent.visibility === 'SPECIFIC' && selectedEvent.participantNames?.length > 0 && (
                                          <div className="cal-detail-row cal-detail-participants">
                                            <span className="cal-detail-label">Participants</span>
                                            <div className="cal-participant-list">
                                              {selectedEvent.participantNames.map((name, i) => (
                                                <span key={i} className="cal-participant-chip">{name}</span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {selectedEvent.createdByFullName && (
                                          <div className="cal-detail-row">
                                            <span className="cal-detail-label">Scheduled by</span>
                                            <span>{selectedEvent.createdByFullName}</span>
                                          </div>
                                        )}
                                      </div>
                                      {selectedEvent.description && (
                                        <p className="cal-detail-desc">{selectedEvent.description}</p>
                                      )}
                                      {isCreator && (
                                        <button
                                          type="button"
                                          className="btn-community-leave cal-delete-btn"
                                          onClick={() => handleDeleteEvent(selectedEvent.id)}
                                          disabled={evtDeleteLoading[selectedEvent.id]}
                                        >
                                          {evtDeleteLoading[selectedEvent.id] ? 'Deleting...' : 'Delete Event'}
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    /* Day event list */
                                    <>
                                      <h4 className="cal-side-title">
                                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                      </h4>
                                      {selectedDayEvents.length === 0 ? (
                                        <p className="cal-side-empty">No events on this day.</p>
                                      ) : (
                                        <div className="cal-event-list">
                                          {selectedDayEvents.map((ev) => (
                                            <button
                                              key={ev.id}
                                              type="button"
                                              className={`cal-event-card cal-event-card-${ev.visibility.toLowerCase()}`}
                                              onClick={() => setSelectedEvent(ev)}
                                            >
                                              <div className="cal-event-card-time">
                                                {formatEventTime(ev.startTime)} - {formatEventTime(ev.endTime)}
                                              </div>
                                              <div className="cal-event-card-title">{ev.title}</div>
                                              <span className={`cal-vis-badge cal-vis-${ev.visibility.toLowerCase()}`}>
                                                {ev.visibility === 'ALL' ? 'All' : 'Specific'}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </>
                              )}
                              {!selectedDate && (
                                <p className="cal-side-empty">Select a day to see events.</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Event creation modal */}
                        {showEventForm && isCreator && (
                          <div className="event-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowEventForm(false); }}>
                            <div className="event-modal">
                              <div className="event-modal-header">
                                <h3 className="event-modal-title">Schedule Event</h3>
                                <button type="button" className="event-modal-close" onClick={() => setShowEventForm(false)}>&times;</button>
                              </div>
                              <form onSubmit={handleCreateEvent} className="event-modal-form">
                                {evtError && <div className="message message-error">{evtError}</div>}
                                <div className="input-group">
                                  <label htmlFor="evt-title" className="input-label">Title</label>
                                  <input
                                    id="evt-title"
                                    type="text"
                                    className="input-field"
                                    placeholder="Sprint Review, Design Sync..."
                                    value={evtTitle}
                                    onChange={(e) => setEvtTitle(e.target.value)}
                                    disabled={evtCreating}
                                    maxLength={200}
                                    autoFocus
                                  />
                                </div>
                                <div className="input-group">
                                  <label htmlFor="evt-desc" className="input-label">Description (optional)</label>
                                  <textarea
                                    id="evt-desc"
                                    className="input-field textarea-field"
                                    placeholder="Event details..."
                                    value={evtDescription}
                                    onChange={(e) => setEvtDescription(e.target.value)}
                                    disabled={evtCreating}
                                    rows={2}
                                  />
                                </div>
                                <div className="evt-datetime-row">
                                  <div className="input-group">
                                    <label htmlFor="evt-start-date" className="input-label">Start Date</label>
                                    <input id="evt-start-date" type="date" className="input-field" value={evtStartDate} onChange={(e) => { setEvtStartDate(e.target.value); if (!evtEndDate) setEvtEndDate(e.target.value); }} disabled={evtCreating} />
                                  </div>
                                  <div className="input-group">
                                    <label htmlFor="evt-start-time" className="input-label">Start Time</label>
                                    <input id="evt-start-time" type="time" className="input-field" value={evtStartTime} onChange={(e) => setEvtStartTime(e.target.value)} disabled={evtCreating} />
                                  </div>
                                  <div className="input-group">
                                    <label htmlFor="evt-end-date" className="input-label">End Date</label>
                                    <input id="evt-end-date" type="date" className="input-field" value={evtEndDate} onChange={(e) => setEvtEndDate(e.target.value)} disabled={evtCreating} />
                                  </div>
                                  <div className="input-group">
                                    <label htmlFor="evt-end-time" className="input-label">End Time</label>
                                    <input id="evt-end-time" type="time" className="input-field" value={evtEndTime} onChange={(e) => setEvtEndTime(e.target.value)} disabled={evtCreating} />
                                  </div>
                                </div>

                                {/* Visibility toggle */}
                                <div className="input-group">
                                  <label className="input-label">Visibility</label>
                                  <div className="evt-vis-toggle">
                                    <button
                                      type="button"
                                      className={`evt-vis-btn${evtVisibility === 'ALL' ? ' evt-vis-active' : ''}`}
                                      onClick={() => setEvtVisibility('ALL')}
                                      disabled={evtCreating}
                                    >
                                      All Members
                                    </button>
                                    <button
                                      type="button"
                                      className={`evt-vis-btn${evtVisibility === 'SPECIFIC' ? ' evt-vis-active' : ''}`}
                                      onClick={() => setEvtVisibility('SPECIFIC')}
                                      disabled={evtCreating}
                                    >
                                      Specific Members
                                    </button>
                                  </div>
                                </div>

                                {/* Participant multi-select */}
                                {evtVisibility === 'SPECIFIC' && (
                                  <div className="input-group">
                                    <label className="input-label">Select Participants</label>
                                    <div className="evt-participant-grid">
                                      {members.map((m) => {
                                        const mUid = m.userId ?? m.id?.userId;
                                        const mName = getMemberDisplayName(m);
                                        const checked = evtParticipants.includes(mUid);
                                        return (
                                          <label key={mUid} className={`evt-participant-item${checked ? ' evt-participant-checked' : ''}`}>
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => toggleEvtParticipant(mUid)}
                                              disabled={evtCreating}
                                            />
                                            <span>{mName}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className="form-actions">
                                  <button
                                    type="submit"
                                    className="btn-primary btn-save"
                                    disabled={evtCreating || !evtTitle.trim() || !evtStartDate || !evtEndDate}
                                    id="submit-event-btn"
                                  >
                                    <span className="btn-content">
                                      {evtCreating && <span className="spinner" />}
                                      {evtCreating ? 'Scheduling...' : 'Schedule Event'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => setShowEventForm(false)}
                                    disabled={evtCreating}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
