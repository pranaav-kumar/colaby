import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { updateProfile } from '../api/usersApi';
import { extractErrorMessage } from '../api/axios';

const STEPS = [
  { label: 'Basic Info', icon: '1' },
  { label: 'Skills & Links', icon: '2' },
];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const [skillInput, setSkillInput] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAddSkill = (e) => {
    if (e) e.preventDefault();
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

  const goNext = () => {
    setError('');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleFinish = async () => {
    setError('');
    setSaving(true);
    try {
      await updateProfile(formData);
      navigate('/explore', { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const getStepClass = (index) => {
    if (index < step) return 'completed';
    if (index === step) return 'active';
    return '';
  };

  return (
    <div className="onboarding-layout">
      <div className="onboarding-wrapper">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-logo">Colaby</div>
          <h1 className="onboarding-title">Welcome aboard! 🚀</h1>
          <p className="onboarding-subtitle">
            Let's set up your developer profile in just a couple of steps.
          </p>
        </div>

        {/* Stepper */}
        <div className="onboarding-stepper">
          {STEPS.map((s, i) => (
            <div key={s.label} className="step-item">
              {i > 0 && (
                <div className={`step-connector${i <= step ? ' filled' : ''}`} />
              )}
              <div className="step-info-col">
                <div className={`step-circle ${getStepClass(i)}`}>
                  {i < step ? '✓' : s.icon}
                </div>
                <span className="step-label">{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="onboarding-card">
          {error && <div className="message message-error">{error}</div>}

          {/* Step 1: Basic Info */}
          {step === 0 && (
            <div className="step-content" key="step-0">
              <h2 className="onboarding-step-title">Tell us about yourself</h2>
              <p className="onboarding-step-desc">
                Fill in your basic details so other developers can find and connect with you.
              </p>

              <div className="onboarding-form">
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
                    <label htmlFor="onb-profileUrl" className="input-label">
                      Avatar Image URL
                    </label>
                    <input
                      id="onb-profileUrl"
                      name="profileUrl"
                      type="url"
                      className="input-field"
                      placeholder="https://example.com/avatar.jpg"
                      value={formData.profileUrl}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="input-group">
                    <label htmlFor="onb-fullName" className="input-label">
                      Full Name
                    </label>
                    <input
                      id="onb-fullName"
                      name="fullName"
                      type="text"
                      className="input-field"
                      placeholder="e.g. Jane Doe"
                      value={formData.fullName}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="input-group">
                    <label htmlFor="onb-userName" className="input-label">
                      Username
                    </label>
                    <input
                      id="onb-userName"
                      name="userName"
                      type="text"
                      className="input-field"
                      placeholder="e.g. janedoe"
                      value={formData.userName}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="onb-bio" className="input-label">
                    Bio
                  </label>
                  <textarea
                    id="onb-bio"
                    name="bio"
                    rows={3}
                    className="input-field textarea-field"
                    placeholder="Share a short introduction, current projects, or tech passions…"
                    value={formData.bio}
                    onChange={handleChange}
                  />
                </div>

                <div className="onboarding-actions">
                  <div />
                  <button
                    type="button"
                    className="btn-next"
                    onClick={goNext}
                    id="onb-next-btn"
                  >
                    Continue →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Skills & Links */}
          {step === 1 && (
            <div className="step-content" key="step-1">
              <h2 className="onboarding-step-title">Skills & Links</h2>
              <p className="onboarding-step-desc">
                Showcase your tech stack and connect your profiles. You can always update these later.
              </p>

              <div className="onboarding-form">
                {/* Skills */}
                <div className="skills-section">
                  <label className="input-label">Skills & Expertise</label>
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
                          handleAddSkill();
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
                            aria-label={`Remove ${skill}`}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Links */}
                <div className="input-group">
                  <label htmlFor="onb-githubUrl" className="input-label">
                    GitHub URL
                  </label>
                  <input
                    id="onb-githubUrl"
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
                  <label htmlFor="onb-linkedinUrl" className="input-label">
                    LinkedIn URL
                  </label>
                  <input
                    id="onb-linkedinUrl"
                    name="linkedinUrl"
                    type="url"
                    className="input-field"
                    placeholder="https://linkedin.com/in/yourprofile"
                    value={formData.linkedinUrl}
                    onChange={handleChange}
                    disabled={saving}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="onb-portfolioUrl" className="input-label">
                    Portfolio URL
                  </label>
                  <input
                    id="onb-portfolioUrl"
                    name="portfolioUrl"
                    type="url"
                    className="input-field"
                    placeholder="https://yourportfolio.dev"
                    value={formData.portfolioUrl}
                    onChange={handleChange}
                    disabled={saving}
                  />
                </div>

                {/* Open to Collaborate */}
                <div className="toggle-group">
                  <label className="toggle-label" htmlFor="onb-openToCollaborate">
                    <input
                      type="checkbox"
                      id="onb-openToCollaborate"
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

                <div className="onboarding-actions">
                  <button
                    type="button"
                    className="btn-back"
                    onClick={goBack}
                    disabled={saving}
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    className="btn-next btn-finish"
                    onClick={handleFinish}
                    disabled={saving}
                    id="onb-finish-btn"
                  >
                    <span className="btn-content">
                      {saving && <span className="spinner" />}
                      {saving ? 'Setting up…' : 'Complete Setup ✓'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
