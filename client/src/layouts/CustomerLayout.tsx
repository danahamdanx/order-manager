import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Logo } from '../components/Logo';

export default function CustomerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/shop" className="brand" aria-label="OrderDesk home">
            <Logo variant="light" size={28} />
          </Link>

          <nav className="topnav" aria-label="Main">
            <NavLink to="/shop">Shop</NavLink>
            {user?.role === 'customer' && <NavLink to="/my-orders">My orders</NavLink>}
          </nav>

          <div className="topbar-right">
            {user ? (
              <>
                {user.role !== 'customer' && (
                  <Link to="/admin" className="topnav-link">
                    Admin panel
                  </Link>
                )}
                <span className="user-chip">
                  <i className="ti ti-user" aria-hidden="true" /> {user.name.split(' ')[0]}
                </span>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    logout();
                    navigate('/shop');
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="topnav-link">
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-accent">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}