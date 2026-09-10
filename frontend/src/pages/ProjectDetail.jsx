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
  deleteTask,
  getDoc,
  upsertDoc,
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

  // Tasks
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskTab, setTaskTab] = useState('all');
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
      const response = taskTab === 'my'
        ? await getMyTasks(projectId)
        : await getAllTasks(projectId);
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

  // Re-load tasks when tab changes
  useEffect(() => {
    if (isMember) {
      loadTasks();
    }
  }, [taskTab]);

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
    <div className="page-layout">
      <Navbar />

      <main className="main-content">
        <div className="container">
          <div className="back-nav-bar">
            <Link to="/projects" className="back-link">
              ← Back to Projects
            </Link>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner" style={{ width: 36, height: 36 }} />
              <p className="text-secondary">Loading project...</p>
            </div>
          ) : error && !project ? (
            <div className="message message-error">{error}</div>
          ) : project ? (
            <>
              {/* Project Header */}
              <div className="community-detail-header">
                <div className="community-detail-info">
                  <div className="project-title-row">
                    <h1 className="page-title">{project.name}</h1>
                    <span className={`project-status-badge ${getStatusClass(project.status)}`}>
                      {project.status}
                    </span>
                  </div>
                  {project.description && (
                    <p className="page-subtitle">{project.description}</p>
                  )}
                  <div className="community-detail-stats">
                    <span className="community-stat-pill">
                      {project.memberCount}{' '}
                      {project.memberCount === 1 ? 'member' : 'members'}
                    </span>
                    {project.techStack && (
                      <span className="community-stat-pill">
                        {project.techStack}
                      </span>
                    )}
                    {project.githubRepoUrl && (
                      <a
                        href={project.githubRepoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="project-github-link"
                      >
                        GitHub
                      </a>
                    )}
                    <span className="community-date-pill">
                      Created {formatDate(project.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="community-detail-actions">
                  {isCreator && (
                    <>
                      <button
                        type="button"
                        className="btn-edit-profile"
                        onClick={() => showEditForm ? setShowEditForm(false) : openEditForm()}
                        id="edit-project-btn"
                      >
                        {showEditForm ? 'Cancel Edit' : 'Edit Project'}
                      </button>
                      <button
                        type="button"
                        className="btn-community-leave"
                        onClick={handleDeleteProject}
                        disabled={deleteLoading}
                        id="delete-project-btn"
                      >
                        {deleteLoading ? 'Deleting...' : 'Delete'}
                      </button>
                    </>
                  )}
                  {!isMember && !joinRequested && (
                    <button
                      type="button"
                      className="btn-community-join"
                      onClick={handleRequestToJoin}
                      disabled={joinLoading}
                      id="join-project-btn"
                    >
                      {joinLoading ? 'Requesting...' : 'Request to Join'}
                    </button>
                  )}
                  {!isMember && joinRequested && (
                    <span className="project-requested-badge">Request Sent</span>
                  )}
                  {isMember && !isCreator && (
                    <span className="project-member-badge">Member</span>
                  )}
                </div>
              </div>

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

              {/* Member-only sections */}
              {isMember && (
                <>
                  {/* ─── Project View Toggle: Dashboard | Workspace ─── */}
                  <div className="project-view-toggle-wrap">
                    <div className="project-view-toggle" role="group" aria-label="Project view">
                      <button
                        type="button"
                        id="project-view-dashboard-btn"
                        className={`project-view-btn${projectView === 'dashboard' ? ' active' : ''}`}
                        onClick={() => setProjectView('dashboard')}
                      >
                        Project Dashboard
                      </button>
                      <button
                        type="button"
                        id="project-view-workspace-btn"
                        className={`project-view-btn${projectView === 'workspace' ? ' active' : ''}`}
                        onClick={() => setProjectView('workspace')}
                      >
                        Project Workspace
                      </button>
                    </div>
                  </div>

                  {/* ─── WORKSPACE PLACEHOLDER ──────────────────────── */}
                  {projectView === 'workspace' && (
                    <div className="project-dashboard-placeholder">
                      <div className="project-dashboard-icon">🛠️</div>
                      <h3 className="project-dashboard-title">Project Workspace</h3>
                      <p className="project-dashboard-desc">
                        Your workspace area. Content coming soon.
                      </p>
                    </div>
                  )}

                  {/* ─── DASHBOARD (Members, Tasks, Docs) ───────────── */}
                  {projectView === 'dashboard' && (
                  <>
                  {/* Section Tabs */}
                  <div className="filter-bar" style={{ marginTop: 8 }}>
                    <div className="filter-tabs">
                      <button
                        type="button"
                        className={`filter-tab${activeSection === 'tasks' ? ' active' : ''}`}
                        onClick={() => setActiveSection('tasks')}
                      >
                        Tasks
                      </button>
                      <button
                        type="button"
                        className={`filter-tab${activeSection === 'members' ? ' active' : ''}`}
                        onClick={() => setActiveSection('members')}
                      >
                        Members ({members.length})
                      </button>
                      <button
                        type="button"
                        className={`filter-tab${activeSection === 'docs' ? ' active' : ''}`}
                        onClick={() => setActiveSection('docs')}
                      >
                        Documentation
                      </button>
                      {isCreator && (
                        <button
                          type="button"
                          className={`filter-tab${activeSection === 'invitations' ? ' active' : ''}`}
                          onClick={() => setActiveSection('invitations')}
                        >
                          Invitations {invitations.length > 0 ? `(${invitations.length})` : ''}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ─── TASKS SECTION ────────────────────────── */}
                  {activeSection === 'tasks' && (
                    <div className="project-section">
                      <div className="project-section-header">
                        <div className="filter-tabs" style={{ marginBottom: 0 }}>
                          <button
                            type="button"
                            className={`filter-tab${taskTab === 'all' ? ' active' : ''}`}
                            onClick={() => setTaskTab('all')}
                          >
                            All Tasks
                          </button>
                          <button
                            type="button"
                            className={`filter-tab${taskTab === 'my' ? ' active' : ''}`}
                            onClick={() => setTaskTab('my')}
                          >
                            My Tasks
                          </button>
                        </div>
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
                        <div className="community-create-card" style={{ marginBottom: 16 }}>
                          <h3 className="card-title">Assign a Task</h3>
                          <form onSubmit={handleAssignTask} className="community-create-form">
                            {taskError && (
                              <div className="message message-error">{taskError}</div>
                            )}
                            <div className="input-group">
                              <label htmlFor="task-assignee" className="input-label">
                                Assign To
                              </label>
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
                              <label htmlFor="task-title" className="input-label">
                                Task Title
                              </label>
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
                              <label htmlFor="task-desc" className="input-label">
                                Description
                              </label>
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

                      {/* Tasks List */}
                      {tasksLoading ? (
                        <div className="loading-container">
                          <div className="spinner" style={{ width: 28, height: 28 }} />
                          <p className="text-secondary">Loading tasks...</p>
                        </div>
                      ) : tasks.length === 0 ? (
                        <div className="empty-state">
                          <h3 className="empty-title">No tasks yet</h3>
                          <p className="empty-desc">
                            {isCreator
                              ? 'Assign tasks to your team members to get started.'
                              : 'No tasks have been assigned yet.'}
                          </p>
                        </div>
                      ) : (
                        <div className="tasks-list">
                          {tasks.map((task) => (
                            <div key={task.id} className="task-card">
                              <div className="task-card-header">
                                <div className="task-info">
                                  <h4 className="task-title">{task.title}</h4>
                                  <div className="task-meta">
                                    <span className={`task-status-badge ${getTaskStatusClass(task.status)}`}>
                                      {task.status.replace('_', ' ')}
                                    </span>
                                    <span className="task-meta-text">
                                      Assigned to: {getMemberName(task.assignedTo)}
                                    </span>
                                    <span className="task-meta-text">
                                      {formatDate(task.createdAt)}
                                    </span>
                                  </div>
                                </div>
                                <div className="task-actions">
                                  {task.assignedTo === user?.userId && editingTaskId !== task.id && (
                                    <button
                                      type="button"
                                      className="btn-secondary btn-sm"
                                      onClick={() => openProgressEditor(task)}
                                    >
                                      Update Progress
                                    </button>
                                  )}
                                  {isCreator && (
                                    <button
                                      type="button"
                                      className="post-delete-btn"
                                      onClick={() => handleDeleteTask(task.id)}
                                      disabled={taskDeleteLoading[task.id]}
                                    >
                                      {taskDeleteLoading[task.id] ? 'Deleting...' : 'Delete'}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {task.description && (
                                <p className="task-description">{task.description}</p>
                              )}

                              {/* Progress Bar */}
                              <div className="task-progress-section">
                                <div className="task-progress-bar">
                                  <div
                                    className="task-progress-fill"
                                    style={{ width: `${task.progressPercent}%` }}
                                  />
                                </div>
                                <span className="task-progress-text">
                                  {task.progressPercent}%
                                </span>
                              </div>

                              {task.progressNote && (
                                <p className="task-progress-note">
                                  {task.progressNote}
                                </p>
                              )}

                              {/* Progress Editor */}
                              {editingTaskId === task.id && (
                                <div className="task-progress-editor">
                                  <div className="input-group">
                                    <label className="input-label">
                                      Progress: {progressPercent}%
                                    </label>
                                    <input
                                      type="range"
                                      min="0"
                                      max="100"
                                      value={progressPercent}
                                      onChange={(e) => setProgressPercent(Number(e.target.value))}
                                      className="progress-slider"
                                      disabled={progressSaving}
                                    />
                                  </div>
                                  <div className="input-group">
                                    <label className="input-label">Progress Note</label>
                                    <input
                                      type="text"
                                      className="input-field"
                                      placeholder="What did you accomplish?"
                                      value={progressNote}
                                      onChange={(e) => setProgressNote(e.target.value)}
                                      disabled={progressSaving}
                                    />
                                  </div>
                                  <div className="form-actions">
                                    <button
                                      type="button"
                                      className="btn-primary btn-sm"
                                      onClick={() => handleUpdateProgress(task.id)}
                                      disabled={progressSaving}
                                    >
                                      {progressSaving ? 'Saving...' : 'Save Progress'}
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
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

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
                  </>
                  )} {/* end projectView === 'dashboard' */}
                </>
              )}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
