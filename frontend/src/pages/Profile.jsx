import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/useAuth';
import { getProfileById, updateProfile } from '../api/usersApi';
import { extractErrorMessage } from '../api/axios';

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSetupMode = searchParams.get('setup') === 'true';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    userName: '',
    profileUrl: '',
    bio: '',
    githubUrl: '',
    linkedinUrl: '',
    portfolioUrl: '',
    openToCollaborate: true,
    skills: [],
  });

  // Read-only system metadata
  const [meta, setMeta] = useState({
    userId: '',
    exp: 0,
    createdAt: null,
    updatedAt: null,
  });

  // Skill input helper
  const [skillInput, setSkillInput] = useState('');

  useEffect(() => {
    async function loadProfile() {
      if (!user?.userId) return;
      try {
        setLoading(true);
        setError('');
        const response = await getProfileById(user.userId);
        const data = response.data || {};

        setFormData({
          fullName: data.fullName || '',
          userName: data.userName || '',
          profileUrl: data.profileUrl || '',
          bio: data.bio || '',
          githubUrl: data.githubUrl || '',
          linkedinUrl: data.linkedinUrl || '',
          portfolioUrl: data.portfolioUrl || '',
          openToCollaborate: data.openToCollaborate ?? true,
          skills: Array.isArray(data.skills) ? data.skills : [],
        });

        setMeta({
          userId: data.userId || user.userId,
          exp: data.exp || 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [user?.userId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAddSkill = (e) => {
    e.preventDefault();
    const trimmed = skillInput.trim();
    if (trimmed && !formData.skills.includes(trimmed)) {
      setFormData((prev) => ({
        ...prev,
        skills: [...prev.skills, trimmed],
      }));
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skillToRemove),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const response = await updateProfile(formData);
      const updated = response.data || {};

      setMeta((prev) => ({
        ...prev,
        exp: updated.exp ?? prev.exp,
        updatedAt: updated.updatedAt || new Date().toISOString(),
      }));

      setSuccess('Profile updated successfully!');

      if (isSetupMode) {
        // After completing profile setup, redirect to home
        setTimeout(() => navigate('/explore', { replace: true }), 1000);
      } else {
        setTimeout(() => setSuccess(''), 4000);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (isoString) => {
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
  };

  return (
    <div className="page-layout">
      <Navbar />

      <main className="main-content">
        <div className="container profile-container">
          <div className="page-header">
            <div>
              <h1 className="page-title">{isSetupMode ? 'Set Up Your Profile' : 'User Profile'}</h1>
              <p className="page-subtitle">
                {isSetupMode
                  ? 'Complete your profile to get started with Colaby'
                  : 'Manage your developer details and collaboration availability'}
              </p>
            </div>
            {meta.userId && (
              <div className="exp-badge" title="Developer Experience Points">
                <span className="exp-icon">⚡</span>
                <span>{meta.exp} EXP</span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner" style={{ width: 36, height: 36 }} />
              <p className="text-secondary">Loading profile details…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="profile-form">
              {error && <div className="message message-error">{error}</div>}
              {success && <div className="message message-success">{success}</div>}

              <div className="profile-grid">
                {/* Left Column: Basic Info & Avatar */}
                <div className="profile-card">
                  <h2 className="card-title">Basic Information</h2>

                  {/* Avatar Preview */}
                  <div className="avatar-preview-section">
                    <div className="avatar-circle">
                      {formData.profileUrl ? (
                        <img
                          src={formData.profileUrl}
                          alt="Profile Avatar"
                          className="avatar-img"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="avatar-initials">
                          {(formData.fullName || formData.userName || 'U')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="avatar-inputs">
                      <label htmlFor="profileUrl" className="input-label">
                        Avatar Image URL
                      </label>
                      <input
                        id="profileUrl"
                        name="profileUrl"
                        type="url"
                        className="input-field"
                        placeholder="https://example.com/avatar.jpg"
                        value={formData.profileUrl}
                        onChange={handleChange}
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="input-group">
                      <label htmlFor="fullName" className="input-label">
                        Full Name
                      </label>
                      <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        className="input-field"
                        placeholder="e.g. Jane Doe"
                        value={formData.fullName}
                        onChange={handleChange}
                        disabled={saving}
                      />
                    </div>

                    <div className="input-group">
                      <label htmlFor="userName" className="input-label">
                        Username
                      </label>
                      <input
                        id="userName"
                        name="userName"
                        type="text"
                        className="input-field"
                        placeholder="e.g. janedoe"
                        value={formData.userName}
                        onChange={handleChange}
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label htmlFor="bio" className="input-label">
                      Bio
                    </label>
                    <textarea
                      id="bio"
                      name="bio"
                      rows={4}
                      className="input-field textarea-field"
                      placeholder="Share a short introduction, current projects, or tech passions…"
                      value={formData.bio}
                      onChange={handleChange}
                      disabled={saving}
                    />
                  </div>

                  {/* Collaboration Status Toggle */}
                  <div className="toggle-group">
                    <label className="toggle-label" htmlFor="openToCollaborate">
                      <input
                        type="checkbox"
                        id="openToCollaborate"
                        name="openToCollaborate"
                        checked={formData.openToCollaborate}
                        onChange={handleChange}
                        disabled={saving}
                        className="toggle-checkbox"
                      />
                      <span className="toggle-switch" />
                      <div className="toggle-text">
                        <span className="toggle-title">Open to Collaborate</span>
                        <span className="toggle-description">
                          Let other developers know you are actively looking to pair up on projects.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Right Column: Skills & Social Links */}
                <div className="profile-card">
                  <h2 className="card-title">Skills & Expertise</h2>

                  <div className="skills-section">
                    <div className="skills-input-row">
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Add a skill (e.g. React, Spring Boot, Go)"
                        value={skillInput}
                        onChange={(e) => setSkillInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSkill(e);
                          }
                        }}
                        disabled={saving}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleAddSkill}
                        disabled={saving || !skillInput.trim()}
                      >
                        Add
                      </button>
                    </div>

                    <div className="skills-chips">
                      {formData.skills.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: '0.8125rem' }}>
                          No skills added yet. Add your core tech stack above!
                        </p>
                      ) : (
                        formData.skills.map((skill) => (
                          <span key={skill} className="skill-chip">
                            {skill}
                            <button
                              type="button"
                              className="skill-remove-btn"
                              onClick={() => handleRemoveSkill(skill)}
                              disabled={saving}
                              aria-label={`Remove ${skill}`}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <h2 className="card-title" style={{ marginTop: '28px' }}>
                    External Links
                  </h2>

                  <div className="input-group">
                    <label htmlFor="githubUrl" className="input-label">
                      GitHub URL
                    </label>
                    <input
                      id="githubUrl"
                      name="githubUrl"
                      type="url"
                      className="input-field"
                      placeholder="https://github.com/yourusername"
                      value={formData.githubUrl}
                      onChange={handleChange}
                      disabled={saving}
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="linkedinUrl" className="input-label">
                      LinkedIn URL
                    </label>
                    <input
                      id="linkedinUrl"
                      name="linkedinUrl"
                      type="url"
                      placeholder="https://linkedin.com/in/yourprofile"
                      className="input-field"
                      value={formData.linkedinUrl}
                      onChange={handleChange}
                      disabled={saving}
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="portfolioUrl" className="input-label">
                      Portfolio URL
                    </label>
                    <input
                      id="portfolioUrl"
                      name="portfolioUrl"
                      type="url"
                      placeholder="https://yourportfolio.dev"
                      className="input-field"
                      value={formData.portfolioUrl}
                      onChange={handleChange}
                      disabled={saving}
                    />
                  </div>

                  {/* Metadata Footer */}
                  <div className="profile-metadata-section">
                    <div className="metadata-row">
                      <span className="metadata-label">User ID</span>
                      <span className="metadata-value" title={meta.userId}>
                        {meta.userId || '—'}
                      </span>
                    </div>
                    <div className="metadata-row">
                      <span className="metadata-label">Member Since</span>
                      <span className="metadata-value">{formatDate(meta.createdAt)}</span>
                    </div>
                    {meta.updatedAt && (
                      <div className="metadata-row">
                        <span className="metadata-label">Last Updated</span>
                        <span className="metadata-value">{formatDate(meta.updatedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Bar */}
              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-primary btn-save"
                  disabled={saving}
                  id="profile-save-btn"
                >
                  <span className="btn-content">
                    {saving && <span className="spinner" />}
                    {saving ? 'Saving Profile…' : isSetupMode ? 'Complete Setup' : 'Save Changes'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
