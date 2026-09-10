import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/useAuth';
import { getIncomingRequests, acceptFriendRequest, rejectFriendRequest } from '../api/profileApi';
import { getProfileById } from '../api/usersApi';

const POLL_INTERVAL_MS = 30_000; // Re-fetch every 30 seconds

/**
 * NotificationBell
 *
 * Displays a bell icon in the Navbar. Shows a badge when the authenticated user
 * has pending incoming friend requests. Clicking opens a dropdown that lists
 * each request with Accept / Reject actions.
 *
 * Data isolation: uses the authenticated user's JWT — each user sees only their
 * own incoming requests. No state is shared across users.
 *
 * The Profile Service returns only UUIDs (senderId). We resolve display names
 * by cross-referencing with the existing User Details Service (/users/details/{id}).
 */
export default function NotificationBell() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);       // raw FriendRequestResponse[]
  const [senderProfiles, setSenderProfiles] = useState({}); // { senderId: profile }
  const [open, setOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null); // requestId being acted on
  const [actionError, setActionError] = useState('');
  const dropdownRef = useRef(null);

  // ── Fetch incoming requests ────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    if (!user?.userId) return;
    try {
      const res = await getIncomingRequests();
      const incoming = Array.isArray(res.data) ? res.data : [];
      setRequests(incoming);

      // Resolve sender display names (only for senders we haven't fetched yet)
      const unseenIds = incoming
        .map((r) => r.senderId)
        .filter((id) => id && !senderProfiles[id]);

      if (unseenIds.length > 0) {
        const results = await Promise.allSettled(
          unseenIds.map((id) => getProfileById(id).then((r) => ({ id, profile: r.data })))
        );
        setSenderProfiles((prev) => {
          const next = { ...prev };
          results.forEach((result) => {
            if (result.status === 'fulfilled') {
              next[result.value.id] = result.value.profile;
            }
          });
          return next;
        });
      }
    } catch {
      // Silently ignore fetch errors for the notification poll
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchRequests();
    const id = setInterval(fetchRequests, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchRequests]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleOutsideClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  // ── Accept / Reject ────────────────────────────────────────────────────────
  const handleAccept = async (requestId) => {
    setLoadingAction(requestId);
    setActionError('');
    try {
      await acceptFriendRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to accept request.';
      setActionError(msg);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReject = async (requestId) => {
    setLoadingAction(requestId);
    setActionError('');
    try {
      await rejectFriendRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to reject request.';
      setActionError(msg);
    } finally {
      setLoadingAction(null);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getSenderName = (senderId) => {
    const p = senderProfiles[senderId];
    if (!p) return senderId ? `${senderId.slice(0, 8)}…` : 'Unknown';
    return p.fullName || p.userName || `${senderId.slice(0, 8)}…`;
  };

  const getSenderInitials = (senderId) => {
    const name = getSenderName(senderId);
    return name.slice(0, 2).toUpperCase();
  };

  const pendingCount = requests.length;

  return (
    <div className="notif-bell-wrap" ref={dropdownRef}>
      {/* Bell button */}
      <button
        type="button"
        id="notif-bell-btn"
        className={`notif-bell-btn${pendingCount > 0 ? ' has-notif' : ''}`}
        onClick={() => {
          setOpen((v) => !v);
          setActionError('');
        }}
        aria-label={`Notifications${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}`}
        title="Friend request notifications"
      >
        {/* Inline SVG bell icon — no icon library required */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {pendingCount > 0 && (
          <span className="notif-badge" aria-label={`${pendingCount} notifications`}>
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="notif-dropdown" role="dialog" aria-label="Notifications">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">Friend Requests</span>
            {pendingCount > 0 && (
              <span className="notif-count-pill">{pendingCount} pending</span>
            )}
          </div>

          {actionError && (
            <div className="notif-action-error">{actionError}</div>
          )}

          {pendingCount === 0 ? (
            <div className="notif-empty">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="notif-empty-icon"
                aria-hidden="true"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <p>No pending friend requests</p>
            </div>
          ) : (
            <ul className="notif-list">
              {requests.map((req) => {
                const isActing = loadingAction === req.id;
                return (
                  <li key={req.id} className="notif-item">
                    <div className="notif-item-avatar">
                      {senderProfiles[req.senderId]?.profileUrl ? (
                        <img
                          src={senderProfiles[req.senderId].profileUrl}
                          alt={getSenderName(req.senderId)}
                          className="notif-avatar-img"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <span className="notif-avatar-initials">
                          {getSenderInitials(req.senderId)}
                        </span>
                      )}
                    </div>

                    <div className="notif-item-body">
                      <p className="notif-item-text">
                        <strong>{getSenderName(req.senderId)}</strong>
                        {' '}sent you a friend request
                      </p>
                      <p className="notif-item-meta">
                        ID: {req.senderId ? `${req.senderId.slice(0, 8)}…` : ''}
                      </p>
                      <p className="notif-item-meta">
                        {req.createdAt
                          ? new Date(req.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })
                          : ''}
                      </p>

                      <div className="notif-item-actions">
                        <button
                          type="button"
                          className="notif-accept-btn"
                          onClick={() => handleAccept(req.id)}
                          disabled={isActing}
                          id={`notif-accept-${req.id}`}
                        >
                          {isActing ? (
                            <span className="spinner notif-spinner" />
                          ) : (
                            'Accept'
                          )}
                        </button>
                        <button
                          type="button"
                          className="notif-reject-btn"
                          onClick={() => handleReject(req.id)}
                          disabled={isActing}
                          id={`notif-reject-${req.id}`}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
