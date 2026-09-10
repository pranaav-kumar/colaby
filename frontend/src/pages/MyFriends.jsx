import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/useAuth';
import { getFriends } from '../api/profileApi';
import { getProfileById } from '../api/usersApi';
import { extractErrorMessage } from '../api/axios';

export default function MyFriends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);            // [{ friendId, since }]
  const [friendProfiles, setFriendProfiles] = useState({}); // { friendId: profile }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFriends();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);

  async function loadFriends() {
    if (!user?.userId) return;
    try {
      setLoading(true);
      setError('');
      const res = await getFriends();
      const list = Array.isArray(res.data) ? res.data : [];
      setFriends(list);

      // Resolve profile info for each friend
      if (list.length > 0) {
        const results = await Promise.allSettled(
          list.map((f) =>
            getProfileById(f.friendId).then((r) => ({ id: f.friendId, profile: r.data }))
          )
        );
        const profiles = {};
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            profiles[result.value.id] = result.value.profile;
          }
        });
        setFriendProfiles(profiles);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  }

  function getFriendDisplayName(friendId) {
    const p = friendProfiles[friendId];
    if (!p) return null;
    return p.fullName || p.userName || null;
  }

  function getFriendInitials(friendId) {
    const name = getFriendDisplayName(friendId) || friendId;
    return name.slice(0, 2).toUpperCase();
  }

  return (
    <div className="page-layout">
      <Navbar />

      <main className="main-content">
        <div className="container">
          <div className="page-header">
            <div>
              <h1 className="page-title">My Friends</h1>
              <p className="page-subtitle">
                People you are connected with on Colaby
              </p>
            </div>
            <span className="friends-count-badge">
              {loading ? '…' : friends.length}{' '}
              {friends.length === 1 ? 'friend' : 'friends'}
            </span>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner" style={{ width: 36, height: 36 }} />
              <p className="text-secondary">Loading friends…</p>
            </div>
          ) : error ? (
            <div className="message message-error">{error}</div>
          ) : friends.length === 0 ? (
            <div className="empty-state">
              <h2 className="empty-title">No friends yet</h2>
              <p className="empty-desc">
                Add friends by visiting developer profiles in the{' '}
                <Link to="/explore" className="btn-link">Explore</Link> section.
              </p>
            </div>
          ) : (
            <div className="friends-list">
              {friends.map((f) => {
                const name = getFriendDisplayName(f.friendId);
                const profile = friendProfiles[f.friendId];
                return (
                  <div key={f.friendId} className="friend-card">
                    <div className="friend-avatar">
                      {profile?.profileUrl ? (
                        <img
                          src={profile.profileUrl}
                          alt={name || 'Friend'}
                          className="friend-avatar-img"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="friend-avatar-initials">
                          {getFriendInitials(f.friendId)}
                        </span>
                      )}
                    </div>

                    <div className="friend-info">
                      <div className="friend-name">
                        {name || (
                          <span className="text-muted">Unknown User</span>
                        )}
                      </div>
                      <div className="friend-userid">
                        ID:{' '}
                        <span title={f.friendId}>
                          {f.friendId
                            ? `${f.friendId.slice(0, 8)}…${f.friendId.slice(-4)}`
                            : '—'}
                        </span>
                      </div>
                      {f.since && (
                        <div className="friend-since">
                          Friends since {formatDate(f.since)}
                        </div>
                      )}
                    </div>

                    <Link
                      to={`/users/${f.friendId}`}
                      className="btn-link friend-view-link"
                    >
                      View Profile →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
