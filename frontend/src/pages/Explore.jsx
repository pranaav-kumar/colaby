import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getAllProfiles } from '../api/usersApi';
import { extractErrorMessage } from '../api/axios';

export default function Explore() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyCollaborators, setOnlyCollaborators] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState('');

  useEffect(() => {
    async function loadAllProfiles() {
      try {
        setLoading(true);
        setError('');
        const response = await getAllProfiles();
        setProfiles(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    loadAllProfiles();
  }, []);

  // Collect all unique skills for quick filtering
  const allSkills = useMemo(() => {
    const skillsSet = new Set();
    profiles.forEach((p) => {
      if (Array.isArray(p.skills)) {
        p.skills.forEach((s) => skillsSet.add(s.trim()));
      }
    });
    return Array.from(skillsSet).sort();
  }, [profiles]);

  // Filter profiles based on search query, open to collab toggle, and selected skill
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (p.fullName && p.fullName.toLowerCase().includes(q)) ||
        (p.userName && p.userName.toLowerCase().includes(q)) ||
        (p.bio && p.bio.toLowerCase().includes(q)) ||
        (Array.isArray(p.skills) &&
          p.skills.some((s) => s.toLowerCase().includes(q)));

      const matchesCollab = !onlyCollaborators || p.openToCollaborate === true;

      const matchesSkill =
        !selectedSkill ||
        (Array.isArray(p.skills) && p.skills.includes(selectedSkill));

      return matchesSearch && matchesCollab && matchesSkill;
    });
  }, [profiles, searchQuery, onlyCollaborators, selectedSkill]);

  return (
    <div className="page-layout">
      <Navbar />

      <main className="main-content">
        <div className="container">
          <div className="explore-header">
            <div>
              <h1 className="page-title">Explore Developers</h1>
              <p className="page-subtitle">
                Discover creators, view profiles, and connect for collaborations
              </p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="filter-bar">
            <div className="search-input-wrapper">
              <input
                type="text"
                className="input-field search-input"
                placeholder="Search by name, skill, username, or keywords…"
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

            <div className="filter-options">
              {allSkills.length > 0 && (
                <select
                  className="input-field filter-select"
                  value={selectedSkill}
                  onChange={(e) => setSelectedSkill(e.target.value)}
                >
                  <option value="">All Tech Skills</option>
                  {allSkills.map((skill) => (
                    <option key={skill} value={skill}>
                      {skill}
                    </option>
                  ))}
                </select>
              )}

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={onlyCollaborators}
                  onChange={(e) => setOnlyCollaborators(e.target.checked)}
                />
                <span>Open to Collaborate</span>
              </label>
            </div>
          </div>

          {/* Content Area */}
          {error && <div className="message message-error">{error}</div>}

          {loading ? (
            <div className="loading-container">
              <div className="spinner" style={{ width: 36, height: 36 }} />
              <p className="text-secondary">Loading developer profiles…</p>
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"></div>
              <h2 className="empty-title">No developers found</h2>
              <p className="empty-desc">
                {searchQuery || selectedSkill || onlyCollaborators
                  ? 'Try adjusting your search criteria or filters.'
                  : 'No public profiles have been registered yet.'}
              </p>
              {(searchQuery || selectedSkill || onlyCollaborators) && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSkill('');
                    setOnlyCollaborators(false);
                  }}
                  style={{ marginTop: '12px' }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="developers-grid">
              {filteredProfiles.map((profile) => (
                <article key={profile.userId} className="developer-card">
                  <div className="developer-card-header">
                    <div className="developer-avatar-wrap">
                      {profile.profileUrl ? (
                        <img
                          src={profile.profileUrl}
                          alt={profile.fullName || profile.userName || 'Developer'}
                          className="developer-avatar"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="developer-avatar-fallback">
                          {(profile.fullName || profile.userName || 'D')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="developer-info">
                      <h2 className="developer-name">
                        <Link
                          to={`/users/${profile.userId}`}
                          className="developer-link"
                        >
                          {profile.fullName || profile.userName || 'Anonymous Developer'}
                        </Link>
                      </h2>
                      {profile.userName && (
                        <span className="developer-username">@{profile.userName}</span>
                      )}
                    </div>

                    <div className="developer-exp-badge" title="Experience Points">
                      ⚡ {profile.exp || 0}
                    </div>
                  </div>

                  {/* Collaboration Status Pill */}
                  <div className="developer-status-bar">
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

                  {/* Bio */}
                  {profile.bio && (
                    <p className="developer-bio">{profile.bio}</p>
                  )}

                  {/* Skills Chips */}
                  {Array.isArray(profile.skills) && profile.skills.length > 0 && (
                    <div className="developer-skills">
                      {profile.skills.map((skill) => (
                        <span
                          key={skill}
                          className="skill-pill"
                          onClick={() => setSelectedSkill(skill)}
                          title={`Filter by ${skill}`}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card Footer / External Links */}
                  <div className="developer-card-footer">
                    <div className="developer-links">
                      {profile.githubUrl && (
                        <a
                          href={profile.githubUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ext-link"
                          title="GitHub Profile"
                        >
                          GitHub
                        </a>
                      )}
                      {profile.linkedinUrl && (
                        <a
                          href={profile.linkedinUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ext-link"
                          title="LinkedIn Profile"
                        >
                          LinkedIn
                        </a>
                      )}
                      {profile.portfolioUrl && (
                        <a
                          href={profile.portfolioUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ext-link"
                          title="Portfolio Site"
                        >
                          Portfolio
                        </a>
                      )}
                    </div>

                    <Link
                      to={`/users/${profile.userId}`}
                      className="btn-link"
                    >
                      View Profile →
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
