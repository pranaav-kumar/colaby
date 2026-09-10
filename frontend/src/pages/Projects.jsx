import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/useAuth';
import {
  getAllProjects,
  getMyProjects,
  createProject,
  requestToJoinProject,
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
  getProjectById,
} from '../api/projectApi';
import { extractProjectError } from '../api/projectApi';
import { getProfileById } from '../api/usersApi';

export default function Projects() {
  const { user } = useAuth();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tab: 'all' or 'my'
  const [activeTab, setActiveTab] = useState('all');

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create project form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createGithubUrl, setCreateGithubUrl] = useState('');
  const [createTechStack, setCreateTechStack] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join request loading tracker
  const [joinLoading, setJoinLoading] = useState({});

  // Invitations
  const [invitations, setInvitations] = useState([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationActionLoading, setInvitationActionLoading] = useState({});
  const [showInvitations, setShowInvitations] = useState(false);
  // Resolved names for invitations: { [projectId]: project, [userId]: profile }
  const [invProjectMap, setInvProjectMap] = useState({});
  const [invProfileMap, setInvProfileMap] = useState({});

  useEffect(() => {
    loadProjects();
    loadMyInvitations();
  }, [activeTab]);

  async function loadProjects() {
    try {
      setLoading(true);
      setError('');
      const response = activeTab === 'my'
        ? await getMyProjects()
        : await getAllProjects();
      setProjects(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadMyInvitations() {
    try {
      setInvitationsLoading(true);
      const response = await getMyInvitations();
      const list = Array.isArray(response.data) ? response.data : [];
      setInvitations(list);

      if (list.length > 0) {
        // Resolve project names and inviter profiles in parallel
        const projectIds = [...new Set(list.map((inv) => inv.projectId).filter(Boolean))];
        const userIds = [...new Set(list.map((inv) => inv.initiatedBy).filter(Boolean))];

        const [projectResults, profileResults] = await Promise.all([
          Promise.allSettled(projectIds.map((id) => getProjectById(id).then((r) => ({ id, data: r.data })))),
          Promise.allSettled(userIds.map((id) => getProfileById(id).then((r) => ({ id, data: r.data })))),
        ]);

        const projects = {};
        projectResults.forEach((r) => {
          if (r.status === 'fulfilled') projects[r.value.id] = r.value.data;
        });
        const profiles = {};
        profileResults.forEach((r) => {
          if (r.status === 'fulfilled') profiles[r.value.id] = r.value.data;
        });

        setInvProjectMap(projects);
        setInvProfileMap(profiles);
      }
    } catch {
      // Silently fail — invitations are secondary
    } finally {
      setInvitationsLoading(false);
    }
  }

  const filteredProjects = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return projects.filter((p) => {
      const matchesSearch =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.techStack?.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchQuery, statusFilter]);

  async function handleCreateProject(e) {
    e.preventDefault();
    setCreateError('');

    if (!createName.trim()) {
      setCreateError('Project name is required.');
      return;
    }

    setCreating(true);
    try {
      const response = await createProject({
        name: createName.trim(),
        description: createDescription.trim() || null,
        githubRepoUrl: createGithubUrl.trim() || null,
        techStack: createTechStack.trim() || null,
      });
      setProjects((prev) => [response.data, ...prev]);
      setCreateName('');
      setCreateDescription('');
      setCreateGithubUrl('');
      setCreateTechStack('');
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(extractProjectError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRequestToJoin(projectId) {
    setJoinLoading((prev) => ({ ...prev, [projectId]: true }));
    try {
      await requestToJoinProject(projectId);
      setError('');
      // Show a brief success indication — update the project card
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, _joinRequested: true } : p
        )
      );
    } catch (err) {
      setError(extractProjectError(err));
    } finally {
      setJoinLoading((prev) => ({ ...prev, [projectId]: false }));
    }
  }

  async function handleAcceptInvitation(invitationId) {
    setInvitationActionLoading((prev) => ({ ...prev, [invitationId]: true }));
    try {
      await acceptInvitation(invitationId);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      // Reload projects to reflect new membership
      loadProjects();
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

  const isCreator = (project) => project.createdBy === user?.userId;

  return (
    <div className="page-layout">
      <Navbar />

      <main className="main-content">
        <div className="container">
          <div className="page-header">
            <div>
              <h1 className="page-title">Projects</h1>
              <p className="page-subtitle">
                Discover projects, collaborate with teams, and build together
              </p>
            </div>
            <div className="page-header-actions">
              {invitations.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setShowInvitations(!showInvitations)}
                  id="toggle-invitations-btn"
                >
                  {showInvitations ? 'Hide' : 'Invitations'} ({invitations.length})
                </button>
              )}
              <button
                type="button"
                className="btn-edit-profile"
                onClick={() => {
                  setShowCreateForm(!showCreateForm);
                  setCreateError('');
                }}
                id="create-project-btn"
              >
                {showCreateForm ? 'Cancel' : '+ New Project'}
              </button>
            </div>
          </div>

          {/* Pending Invitations */}
          {showInvitations && invitations.length > 0 && (
            <div className="invitations-section">
              <h2 className="section-title">Pending Invitations</h2>
              <div className="invitations-list">
                {invitations.map((inv) => {
                  const proj = invProjectMap[inv.projectId];
                  const inviter = invProfileMap[inv.initiatedBy];
                  const inviterName = inviter?.fullName || inviter?.userName || null;
                  return (
                  <div key={inv.id} className="invitation-card">
                    <div className="invitation-info">
                      <span className="invitation-label">
                        Project Invitation
                      </span>
                      <span className="invitation-meta">
                        <strong>Project:</strong>{' '}
                        {proj?.name || `${inv.projectId.slice(0, 8)}…`}
                      </span>
                      <span className="invitation-meta">
                        <strong>From:</strong>{' '}
                        {inviterName || `${inv.initiatedBy.slice(0, 8)}…`}
                        {' '}<span style={{ opacity: 0.6 }}>(ID: {inv.initiatedBy.slice(0, 8)}…)</span>
                      </span>
                      <span className="invitation-meta">
                        {formatDate(inv.createdAt)}
                      </span>
                    </div>
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
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Create Project Form */}
          {showCreateForm && (
            <div className="community-create-card">
              <h2 className="card-title">Create a Project</h2>
              <form onSubmit={handleCreateProject} className="community-create-form">
                {createError && (
                  <div className="message message-error">{createError}</div>
                )}
                <div className="input-group">
                  <label htmlFor="project-name" className="input-label">
                    Project Name
                  </label>
                  <input
                    id="project-name"
                    type="text"
                    className="input-field"
                    placeholder="e.g. Colaby Mobile App"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    disabled={creating}
                    maxLength={100}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="project-description" className="input-label">
                    Description
                  </label>
                  <textarea
                    id="project-description"
                    className="input-field textarea-field"
                    placeholder="What is this project about?"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    disabled={creating}
                    rows={3}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="project-github" className="input-label">
                    GitHub Repository URL
                  </label>
                  <input
                    id="project-github"
                    type="url"
                    className="input-field"
                    placeholder="https://github.com/username/repo"
                    value={createGithubUrl}
                    onChange={(e) => setCreateGithubUrl(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="project-techstack" className="input-label">
                    Tech Stack
                  </label>
                  <input
                    id="project-techstack"
                    type="text"
                    className="input-field"
                    placeholder="e.g. React, Spring Boot, PostgreSQL"
                    value={createTechStack}
                    onChange={(e) => setCreateTechStack(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn-primary btn-save"
                    disabled={creating || !createName.trim()}
                    id="submit-project-btn"
                  >
                    <span className="btn-content">
                      {creating && <span className="spinner" />}
                      {creating ? 'Creating...' : 'Create Project'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tabs & Filters */}
          <div className="filter-bar">
            <div className="filter-tabs">
              <button
                type="button"
                className={`filter-tab${activeTab === 'all' ? ' active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All Projects
              </button>
              <button
                type="button"
                className={`filter-tab${activeTab === 'my' ? ' active' : ''}`}
                onClick={() => setActiveTab('my')}
              >
                My Projects
              </button>
            </div>
            <div className="filter-controls">
              <div className="search-input-wrapper">
                <input
                  type="text"
                  className="input-field search-input"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              <select
                className="input-field filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && <div className="message message-error">{error}</div>}

          {/* Content */}
          {loading ? (
            <div className="loading-container">
              <div className="spinner" style={{ width: 36, height: 36 }} />
              <p className="text-secondary">Loading projects...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="empty-state">
              <h2 className="empty-title">No projects found</h2>
              <p className="empty-desc">
                {searchQuery || statusFilter
                  ? 'Try adjusting your search or filters.'
                  : activeTab === 'my'
                  ? 'You are not a member of any projects yet.'
                  : 'Be the first to create a project!'}
              </p>
              {(searchQuery || statusFilter) && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                  }}
                  style={{ marginTop: '12px' }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="communities-grid">
              {filteredProjects.map((project) => (
                <article key={project.id} className="community-card project-card">
                  <div className="community-card-header">
                    <div className="community-avatar-wrap">
                      <div className="community-avatar-fallback">
                        {(project.name || 'P').slice(0, 2).toUpperCase()}
                      </div>
                    </div>
                    <div className="community-info">
                      <h2 className="community-name">
                        <Link
                          to={`/projects/${project.id}`}
                          className="developer-link"
                        >
                          {project.name}
                        </Link>
                      </h2>
                      <span className="community-meta">
                        {project.memberCount}{' '}
                        {project.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                    <div className="community-membership-area">
                      <span className={`project-status-badge ${getStatusClass(project.status)}`}>
                        {project.status}
                      </span>
                    </div>
                  </div>

                  {project.description && (
                    <p className="community-description">
                      {project.description.length > 150
                        ? project.description.slice(0, 150) + '...'
                        : project.description}
                    </p>
                  )}

                  {project.techStack && (
                    <div className="project-tech-chips">
                      {project.techStack.split(',').map((tech, i) => (
                        <span key={i} className="project-tech-chip">
                          {tech.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="community-card-footer">
                    <span className="community-date">
                      Created {formatDate(project.createdAt)}
                    </span>
                    <div className="project-card-actions">
                      {project.isMember ? (
                        <span className="project-member-badge">Member</span>
                      ) : project._joinRequested ? (
                        <span className="project-requested-badge">Requested</span>
                      ) : (
                        <button
                          type="button"
                          className="btn-community-join"
                          onClick={() => handleRequestToJoin(project.id)}
                          disabled={joinLoading[project.id]}
                        >
                          {joinLoading[project.id] ? 'Requesting...' : 'Request to Join'}
                        </button>
                      )}
                      <Link
                        to={`/projects/${project.id}`}
                        className="btn-link"
                      >
                        View Details →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
