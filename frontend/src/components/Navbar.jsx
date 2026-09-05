import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function Navbar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Get a short display representation of the user
  const shortUserId = user?.userId ? `${user.userId.slice(0, 6)}…` : '';

  return (
    <header className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <Link to="/explore" className="navbar-brand">
            <span className="navbar-logo-text">Colaby</span>
          </Link>

          <nav className="navbar-nav">
            <NavLink
              to="/explore"
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              Explore
            </NavLink>
            <NavLink
              to="/community"
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              Community
            </NavLink>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              My Profile
            </NavLink>
          </nav>
        </div>

        <div className="navbar-right">
          {shortUserId && (
            <span className="navbar-user-badge" title={`User ID: ${user.userId}`}>
              <span className="status-dot online" />
              {shortUserId}
            </span>
          )}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={handleLogout}
            id="nav-logout-btn"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
