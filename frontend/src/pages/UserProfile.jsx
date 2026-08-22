import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProfileById } from '../api/usersApi';
import { extractErrorMessage } from '../api/axios';

export default function UserProfile() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
                      ⚡ {profile.exp || 0} EXP
                    </div>
                  </div>

                  {profile.userName && (
                    <div className="userprofile-handle">@{profile.userName}</div>
                  )}

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
                  <h2 className="section-heading">Skills & Technologies</h2>
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
                <h2 className="section-heading">Connect & Links</h2>
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
