import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { extractErrorMessage } from '../api/axios';

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const from = location.state?.from?.pathname || '/explore';

  function validate() {
    const errors = {};
    if (!email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!password) {
      errors.password = 'Password is required.';
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
      await login(email, password);
      setSuccess('Login successful! Redirecting…');
      setEmail('');
      setPassword('');
      setFieldErrors({});
      navigate(from, { replace: true });
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
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to your account to continue</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {error && <div className="message message-error">{error}</div>}
          {success && <div className="message message-success">{success}</div>}

          <div className="input-group">
            <label htmlFor="login-email" className="input-label">
              Email
            </label>
            <input
              id="login-email"
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
            <label htmlFor="login-password" className="input-label">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className={`input-field${fieldErrors.password ? ' input-error' : ''}`}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
              }}
              autoComplete="current-password"
              disabled={loading}
            />
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password}</span>
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={loading} id="login-submit-btn">
            <span className="btn-content">
              {loading && <span className="spinner" />}
              {loading ? 'Signing in…' : 'Sign In'}
            </span>
          </button>
        </form>

        <div className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link to="/signup">Sign Up</Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
