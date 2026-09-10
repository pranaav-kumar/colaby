import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/useAuth';
import { getProfileById } from '../api/usersApi';
import {
  sendFriendRequest,
  getIncomingRequests,
  getSentRequests,
  getFriends,
  acceptFriendRequest,
  rejectFriendRequest,
} from '../api/profileApi';
import { extractErrorMessage } from '../api/axios';

/**
 * Possible relationship states between the logged-in user and the profile being viewed:
 *  - 'self'         → viewing own profile (no friend button)
 *  - 'friends'      → already friends
 *  - 'pending_sent' → current user sent a request, awaiting the other user's response
 *  - 'pending_recv' → the other user sent a request to the current user (show Accept/Reject)
 *  - 'none'         → no relationship; show Add Friend
 */

export default function UserProfile() {
  const { id } = useParams();
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Friend relationship state
  const [relationship, setRelationship] = useState('none'); // see above
  const [pendingRequestId, setPendingRequestId] = useState(null); // requestId if pending_recv
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [friendActionError, setFriendActionError] = useState('');
  const [friendActionSuccess, setFriendActionSuccess] = useState('');

  // Copy User ID
  const [copiedUserId, setCopiedUserId] = useState(false);

  const handleCopyUserId = () => {
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedUserId(true);
      setTimeout(() => setCopiedUserId(false), 2000);
    }).catch(() => {});
  };

  // ── Load profile & relationship ──────────────────────────────────────────
  useEffect(() => {
    async function loadUserProfile() {
      if (!id) return;
      try {
        setLoading(true);
        setError('');
        const response = await getProfileById(id);
        setProfile(response.data);
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    loadUserProfile();
  }, [id]);

  useEffect(() => {
    async function determineRelationship() {
      if (!id || !user?.userId) return;

      // If viewing own profile, no friend button needed
      if (id === user.userId) {
        setRelationship('self');
        return;
      }

      try {
        // Run all three checks in parallel for speed
        const [friendsRes, sentRes, incomingRes] = await Promise.all([
          getFriends(),
          getSentRequests(),
          getIncomingRequests(),
        ]);

        const friends = Array.isArray(friendsRes.data) ? friendsRes.data : [];
        const sent = Array.isArray(sentRes.data) ? sentRes.data : [];
        const incoming = Array.isArray(incomingRes.data) ? incomingRes.data : [];

        // Check if already friends
        if (friends.some((f) => f.friendId === id)) {
          setRelationship('friends');
          return;
        }

        // Check if current user sent a pending request to this profile
        const sentReq = sent.find((r) => r.receiverId === id);
        if (sentReq) {
          setRelationship('pending_sent');
          return;
        }

        // Check if this profile sent a request to the current user
        const incomingReq = incoming.find((r) => r.senderId === id);
        if (incomingReq) {
          setRelationship('pending_recv');
          setPendingRequestId(incomingReq.id);
          return;
        }

        setRelationship('none');
      } catch {
        // If relationship check fails, default to 'none' (non-critical)
        setRelationship('none');
      }
    }

    determineRelationship();
  }, [id, user?.userId]);

  // ── Friend actions ────────────────────────────────────────────────────────
  const handleSendRequest = async () => {
    setFriendActionLoading(true);
    setFriendActionError('');
    setFriendActionSuccess('');
    try {
      await sendFriendRequest(id);
      setRelationship('pending_sent');
      setFriendActionSuccess('Friend request sent!');
      setTimeout(() => setFriendActionSuccess(''), 3000);
    } catch (err) {
      const msg = err?.response?.data?.error || extractErrorMessage(err);
      setFriendActionError(msg);
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (!pendingRequestId) return;
    setFriendActionLoading(true);
    setFriendActionError('');
    setFriendActionSuccess('');
    try {
      await acceptFriendRequest(pendingRequestId);
      setRelationship('friends');
      setPendingRequestId(null);
      setFriendActionSuccess('You are now friends!');
      setTimeout(() => setFriendActionSuccess(''), 3000);
    } catch (err) {
      const msg = err?.response?.data?.error || extractErrorMessage(err);
      setFriendActionError(msg);
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!pendingRequestId) return;
    setFriendActionLoading(true);
    setFriendActionError('');
    setFriendActionSuccess('');
    try {
      await rejectFriendRequest(pendingRequestId);
      setRelationship('none');
      setPendingRequestId(null);
    } catch (err) {
      const msg = err?.response?.data?.error || extractErrorMessage(err);
      setFriendActionError(msg);
    } finally {
      setFriendActionLoading(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  // ── Render friend button area ─────────────────────────────────────────────
  const renderFriendActions = () => {
    if (relationship === 'self') return null;

    return (
      <div className="userprofile-friend-area">
        {friendActionError && (
          <div className="message message-error" style={{ marginBottom: '8px', fontSize: '0.8125rem' }}>
            {friendActionError}
          </div>
        )}
        {friendActionSuccess && (
          <div className="message message-success" style={{ marginBottom: '8px', fontSize: '0.8125rem' }}>
            {friendActionSuccess}
          </div>
        )}

        {relationship === 'friends' && (
          <span className="friend-status-badge friends">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Friends
          </span>
        )}

        {relationship === 'pending_sent' && (
          <span className="friend-status-badge pending">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Request Pending
          </span>
        )}

        {relationship === 'pending_recv' && (
          <div className="friend-recv-actions">
            <p className="friend-recv-label">
              This developer sent you a friend request
            </p>
            <div className="friend-recv-btns">
              <button
                type="button"
                className="btn-friend-accept"
                onClick={handleAcceptRequest}
                disabled={friendActionLoading}
                id="userprofile-accept-btn"
              >
                {friendActionLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Accept'}
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={handleRejectRequest}
                disabled={friendActionLoading}
                id="userprofile-reject-btn"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {relationship === 'none' && (
          <button
            type="button"
            className="btn-friend-add"
            onClick={handleSendRequest}
            disabled={friendActionLoading}
            id="userprofile-add-friend-btn"
          >
            {friendActionLoading ? (
              <span className="btn-content">
                <span className="spinner" style={{ width: 14, height: 14 }} />
                Sending…
              </span>
            ) : (
              <span className="btn-content">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                Add Friend
              </span>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="page-layout">
      <Navbar />

      <main className="main-content">
        <div className="container userprofile-container">
          <div className="back-nav-bar">
            <Link to="/explore" className="back-link">
              ← Back to Explore
            </Link>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner" style={{ width: 36, height: 36 }} />
              <p className="text-secondary">Loading developer profile…</p>
            </div>
          ) : error ? (
            <div className="profile-card error-card">
              <div className="message message-error">{error}</div>
              <Link to="/explore" className="btn-secondary" style={{ display: 'inline-block', marginTop: '16px' }}>
                Return to Explore
              </Link>
            </div>
          ) : !profile ? (
            <div className="profile-card">
              <p className="text-secondary">User profile could not be found.</p>
            </div>
          ) : (
            <div className="userprofile-card">
              {/* Profile Top Banner */}
              <div className="userprofile-header">
                <div className="userprofile-avatar-wrap">
                  {profile.profileUrl ? (
                    <img
                      src={profile.profileUrl}
                      alt={profile.fullName || profile.userName || 'Developer'}
                      className="userprofile-avatar"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="userprofile-avatar-fallback">
                      {(profile.fullName || profile.userName || 'D')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="userprofile-main-info">
                  <div className="userprofile-title-row">
                    <h1 className="userprofile-name">
                      {profile.fullName || profile.userName || 'Anonymous Developer'}
                    </h1>
                    <div className="exp-badge" title="Developer Experience Points">
                      {profile.exp || 0} EXP
                    </div>
                  </div>

                  {profile.userName && (
                    <div className="userprofile-handle">@{profile.userName}</div>
                  )}

                  {/* User ID Row */}
                  <div className="userprofile-userid-row">
                    <span className="userprofile-userid-label">User ID:</span>
                    <span className="userprofile-userid-value" title={id}>
                      {id ? `${id.slice(0, 8)}…${id.slice(-4)}` : '—'}
                    </span>
                    {id && (
                      <button
                        type="button"
                        className={`copy-id-btn${copiedUserId ? ' copied' : ''}`}
                        onClick={handleCopyUserId}
                        aria-label="Copy User ID"
                        title="Copy full User ID"
                        id="userprofile-copy-userid-btn"
                      >
                        {copiedUserId ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                  </div>

                  <div className="userprofile-collab-tag">
                    {profile.openToCollaborate ? (
                      <span className="collab-status open">
                        <span className="status-dot online" /> Open to collaborate
                      </span>
                    ) : (
                      <span className="collab-status closed">
                        <span className="status-dot offline" /> Busy / Not open
                      </span>
                    )}
                  </div>

                  {/* Friend Actions */}
                  {renderFriendActions()}
                </div>
              </div>

              {/* Bio Section */}
              {profile.bio && (
                <div className="userprofile-section">
                  <h2 className="section-heading">About</h2>
                  <p className="userprofile-bio">{profile.bio}</p>
                </div>
              )}

              {/* Skills Section */}
              {Array.isArray(profile.skills) && profile.skills.length > 0 && (
                <div className="userprofile-section">
                  <h2 className="section-heading">Skills &amp; Technologies</h2>
                  <div className="skills-chips">
                    {profile.skills.map((skill) => (
                      <span key={skill} className="skill-chip read-only">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Links Section */}
              <div className="userprofile-section">
                <h2 className="section-heading">Connect &amp; Links</h2>
                <div className="links-row">
                  {profile.githubUrl && (
                    <a
                      href={profile.githubUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="link-card"
                    >
                      <span className="link-title">GitHub</span>
                      <span className="link-url">{profile.githubUrl}</span>
                    </a>
                  )}
                  {profile.linkedinUrl && (
                    <a
                      href={profile.linkedinUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="link-card"
                    >
                      <span className="link-title">LinkedIn</span>
                      <span className="link-url">{profile.linkedinUrl}</span>
                    </a>
                  )}
                  {profile.portfolioUrl && (
                    <a
                      href={profile.portfolioUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="link-card"
                    >
                      <span className="link-title">Portfolio</span>
                      <span className="link-url">{profile.portfolioUrl}</span>
                    </a>
                  )}
                  {!profile.githubUrl && !profile.linkedinUrl && !profile.portfolioUrl && (
                    <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                      No external links provided.
                    </p>
                  )}
                </div>
              </div>

              {/* Metadata Footer */}
              <div className="userprofile-footer">
                <span className="text-muted" style={{ fontSize: '0.8125rem' }}>
                  Member since {formatDate(profile.createdAt)}
                </span>
                {profile.updatedAt && (
                  <span className="text-muted" style={{ fontSize: '0.8125rem' }}>
                    Last active {formatDate(profile.updatedAt)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
