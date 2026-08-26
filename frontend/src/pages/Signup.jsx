import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { extractErrorMessage } from '../api/axios';

function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  function validate() {
    const errors = {};
    if (!email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);

    try {
      await signup(email, password);

      setSuccess('Account created successfully! Setting up your profile…');
      setEmail('');
      setPassword('');
      setFieldErrors({});

      // Redirect to profile setup
      setTimeout(() => navigate('/profile?setup=true', { replace: true }), 1000);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-background">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">Colaby</div>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Get started with Colaby in seconds</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {error && <div className="message message-error">{error}</div>}
          {success && <div className="message message-success">{success}</div>}

          <div className="input-group">
            <label htmlFor="signup-email" className="input-label">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              className={`input-field${fieldErrors.email ? ' input-error' : ''}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }));
              }}
              autoComplete="email"
              disabled={loading}
            />
            {fieldErrors.email && (
              <span className="field-error">{fieldErrors.email}</span>
            )}
          </div>

          <div className="input-group">
            <label htmlFor="signup-password" className="input-label">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              className={`input-field${fieldErrors.password ? ' input-error' : ''}`}
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
              }}
              autoComplete="new-password"
              disabled={loading}
            />
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password}</span>
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={loading} id="signup-submit-btn">
            <span className="btn-content">
              {loading && <span className="spinner" />}
              {loading ? 'Creating account…' : 'Create Account'}
            </span>
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <Link to="/login">Login</Link>
        </div>
      </div>
    </div>
  );
}

export default Signup;
