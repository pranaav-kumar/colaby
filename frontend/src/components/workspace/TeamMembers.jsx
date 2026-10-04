import { useState, useEffect } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/useAuth';
import { getProjectInvitations, acceptInvitation, declineInvitation, inviteUserToProject } from '../../api/projectApi';
import { IconX } from '../common/Icons';


export default function TeamMembers() {
  const { projectId, members, projectInfo } = useWorkspace();
  const { user } = useAuth();
  const [invitations, setInvitations] = useState([]);
  const [inviteId, setInviteId] = useState('');
  const [msg, setMsg] = useState(null);

  const isCreator = projectInfo?.createdBy && user?.userId && 
    String(projectInfo.createdBy).toLowerCase() === String(user.userId).toLowerCase();

  const fetchInvitations = async () => {
    if (!isCreator || !projectId) return;
    try {
      const { data } = await getProjectInvitations(projectId);
      setInvitations(data || []);
    } catch (err) {
      console.error('Failed to load invitations', err);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, [projectId, isCreator]);

  const handleAccept = async (invitationId) => {
    try {
      await acceptInvitation(invitationId);
      setMsg({ type: 'success', text: 'User added to project workspace.' });
      fetchInvitations();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    }
  };

  const handleDecline = async (invitationId) => {
    try {
      await declineInvitation(invitationId);
      setMsg({ type: 'success', text: 'Request declined.' });
      fetchInvitations();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteId.trim()) return;
    try {
      await inviteUserToProject(projectId, inviteId.trim());
      setMsg({ type: 'success', text: `Invitation sent to ${inviteId}.` });
      setInviteId('');
      fetchInvitations();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    }
  };

  return (
    <div className="team-panel-container workspace-section">
      <div className="team-panel-inner">
        {/* Header */}
        <div className="team-panel-header">
          <div>
            <h2 className="team-section-title">Team Members</h2>
            <p className="team-section-desc">Manage project access, collaborators, and pending invitations.</p>
          </div>
          <span className="team-count-badge">{members.length} {members.length === 1 ? 'member' : 'members'}</span>
        </div>

        {/* Message Banner */}
        {msg && (
          <div className={`team-banner ${msg.type}`}>
            <span>{msg.text}</span>
            <button type="button" onClick={() => setMsg(null)} className="team-banner-close" aria-label="Close message">
              <IconX width={14} height={14} />
            </button>
          </div>
        )}

        {/* Creator Controls */}
        {isCreator && (
          <div className="team-invite-card">
            <h3 className="team-card-title">Invite Collaborator</h3>
            <p className="team-card-sub">Add a developer to this workspace using their User UUID.</p>
            <form onSubmit={handleInvite} className="team-invite-form">
              <input 
                type="text"
                className="input-field team-invite-input"
                placeholder="User UUID (e.g. 7689219c-c80f-4c3e-8377-...)"
                value={inviteId}
                onChange={e => setInviteId(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary team-invite-btn">
                Invite Member
              </button>
            </form>
          </div>
        )}

        {/* Pending Invitations */}
        {isCreator && invitations.length > 0 && (
          <div className="team-invitations-block">
            <h3 className="team-card-title">Pending Invitations ({invitations.length})</h3>
            <div className="team-invitations-list">
              {invitations.map(inv => {
                const isJoinReq = inv.type === 'JOIN_REQUEST';
                const targetId = inv.targetUserId || inv.initiatedBy;
                return (
                  <div key={inv.id} className="team-invitation-row">
                    <div className="team-invitation-info">
                      <span className="team-invitation-user">{targetId}</span>
                      <span className="team-invitation-type">
                        {isJoinReq ? 'Requested to join workspace' : 'Invitation sent'} • {new Date(inv.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="team-invitation-actions">
                      {isJoinReq ? (
                        <>
                          <button type="button" className="btn-primary btn-sm" onClick={() => handleAccept(inv.id)}>
                            Accept
                          </button>
                          <button type="button" className="btn-secondary btn-sm danger" onClick={() => handleDecline(inv.id)}>
                            Decline
                          </button>
                        </>
                      ) : (
                        <span className="team-status-tag">Pending response</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Members List */}
        <div className="team-members-list-block">
          <div className="team-table-header">
            <span>Member</span>
            <span>Role</span>
          </div>

          <div className="team-members-rows">
            {members.map((member, idx) => {
              const uid = member.id?.userId || member.userId || (typeof member.id === 'string' ? member.id : 'User');
              const isUserCreator = member.role === 'CREATOR';
              const initial = String(uid).substring(0, 2).toUpperCase();
              return (
                <div key={uid || idx} className="team-member-row">
                  <div className="team-member-left">
                    <div className="team-member-avatar">
                      {initial}
                    </div>
                    <div className="team-member-details">
                      <span className="team-member-uid">{uid}</span>
                      <span className="team-member-joined">Joined {new Date(member.joinedAt || Date.now()).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <span className={`team-role-tag ${isUserCreator ? 'creator' : 'member'}`}>
                    {member.role || 'MEMBER'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
