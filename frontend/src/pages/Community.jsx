import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/useAuth';
import { getAllCommunities, createCommunity, joinCommunity, leaveCommunity } from '../api/communityApi';
import { extractErrorMessage } from '../api/axios';

export default function Community() {
  const { user } = useAuth();

  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Create community form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join/leave loading tracker
  const [membershipLoading, setMembershipLoading] = useState({});

  useEffect(() => {
    loadCommunities();
  }, []);

  async function loadCommunities() {
    try {
      setLoading(true);
      setError('');
      const response = await getAllCommunities();
      setCommunities(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const filteredCommunities = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return communities;
    return communities.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
    );
  }, [communities, searchQuery]);

  async function handleCreateCommunity(e) {
    e.preventDefault();
    setCreateError('');

    if (!createName.trim()) {
      setCreateError('Community name is required.');
      return;
    }

    setCreating(true);
    try {
      const response = await createCommunity({
        name: createName.trim(),
        description: createDescription.trim() || null,
      });
      // Add the new community to list
      setCommunities((prev) => [response.data, ...prev]);
      setCreateName('');
      setCreateDescription('');
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(communityId) {
    setMembershipLoading((prev) => ({ ...prev, [communityId]: true }));
    try {
      await joinCommunity(communityId);
      setCommunities((prev) =>
        prev.map((c) =>
          c.id === communityId
            ? { ...c, isMember: true, memberCount: c.memberCount + 1 }
            : c
        )
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setMembershipLoading((prev) => ({ ...prev, [communityId]: false }));
    }
  }

  async function handleLeave(communityId) {
    setMembershipLoading((prev) => ({ ...prev, [communityId]: true }));
    try {
      await leaveCommunity(communityId);
      setCommunities((prev) =>
        prev.map((c) =>
          c.id === communityId
            ? { ...c, isMember: false, memberCount: Math.max(0, c.memberCount - 1) }
            : c
        )
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setMembershipLoading((prev) => ({ ...prev, [communityId]: false }));
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

  return (
    <div className="page-layout">
      <Navbar />

      <main className="main-content">
        <div className="container">
          <div className="page-header">
            <div>
              <h1 className="page-title">Community</h1>
              <p className="page-subtitle">
                Browse communities, join discussions, and share your ideas
              </p>
            </div>
            <button
              type="button"
              className="btn-edit-profile"
              onClick={() => {
                setShowCreateForm(!showCreateForm);
                setCreateError('');
              }}
              id="create-community-btn"
            >
              {showCreateForm ? 'Cancel' : '+ New Community'}
            </button>
          </div>

          {/* Create Community Form */}
          {showCreateForm && (
            <div className="community-create-card">
              <h2 className="card-title">Create a Community</h2>
              <form onSubmit={handleCreateCommunity} className="community-create-form">
                {createError && (
                  <div className="message message-error">{createError}</div>
                )}
                <div className="input-group">
                  <label htmlFor="community-name" className="input-label">
                    Community Name
                  </label>
                  <input
                    id="community-name"
                    type="text"
                    className="input-field"
                    placeholder="e.g. React Developers"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    disabled={creating}
                    maxLength={100}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="community-description" className="input-label">
                    Description
                  </label>
                  <textarea
                    id="community-description"
                    className="input-field textarea-field"
                    placeholder="What is this community about?"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    disabled={creating}
                    rows={3}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn-primary btn-save"
                    disabled={creating || !createName.trim()}
                    id="submit-community-btn"
                  >
                    <span className="btn-content">
                      {creating && <span className="spinner" />}
                      {creating ? 'Creating...' : 'Create Community'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Search */}
          <div className="filter-bar">
            <div className="search-input-wrapper">
              <input
                type="text"
                className="input-field search-input"
                placeholder="Search communities..."
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
          </div>

          {/* Error */}
          {error && <div className="message message-error">{error}</div>}

          {/* Content */}
          {loading ? (
            <div className="loading-container">
              <div className="spinner" style={{ width: 36, height: 36 }} />
              <p className="text-secondary">Loading communities...</p>
            </div>
          ) : filteredCommunities.length === 0 ? (
            <div className="empty-state">
              <h2 className="empty-title">No communities found</h2>
              <p className="empty-desc">
                {searchQuery
                  ? 'Try adjusting your search.'
                  : 'Be the first to create a community!'}
              </p>
              {searchQuery && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setSearchQuery('')}
                  style={{ marginTop: '12px' }}
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            <div className="communities-grid">
              {filteredCommunities.map((community) => (
                <article key={community.id} className="community-card">
                  <div className="community-card-header">
                    <div className="community-avatar-wrap">
                      <div className="community-avatar-fallback">
                        {(community.name || 'C').slice(0, 2).toUpperCase()}
                      </div>
                    </div>
                    <div className="community-info">
                      <h2 className="community-name">
                        <Link
                          to={`/community/${community.id}`}
                          className="developer-link"
                        >
                          {community.name}
                        </Link>
                      </h2>
                      <span className="community-meta">
                        {community.memberCount}{' '}
                        {community.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                    <div className="community-membership-area">
                      {community.isMember ? (
                        <button
                          type="button"
                          className="btn-community-leave"
                          onClick={() => handleLeave(community.id)}
                          disabled={membershipLoading[community.id]}
                        >
                          {membershipLoading[community.id]
                            ? 'Leaving...'
                            : 'Joined'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-community-join"
                          onClick={() => handleJoin(community.id)}
                          disabled={membershipLoading[community.id]}
                        >
                          {membershipLoading[community.id]
                            ? 'Joining...'
                            : 'Join'}
                        </button>
                      )}
                    </div>
                  </div>

                  {community.description && (
                    <p className="community-description">
                      {community.description}
                    </p>
                  )}

                  <div className="community-card-footer">
                    <span className="community-date">
                      Created {formatDate(community.createdAt)}
                    </span>
                    <Link
                      to={`/community/${community.id}`}
                      className="btn-link"
                    >
                      View Posts →
                    </Link>
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
