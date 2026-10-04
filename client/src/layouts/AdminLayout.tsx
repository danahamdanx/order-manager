import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Logo } from '../components/Logo';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="admin">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Logo variant="light" size={28} />
        </div>

        <nav className="sidebar-nav" aria-label="Admin">
          <NavLink to="/admin" end>
            <i className="ti ti-layout-dashboard" aria-hidden="true" /> Dashboard
          </NavLink>
          <NavLink to="/admin/orders">
            <i className="ti ti-package" aria-hidden="true" /> Orders
          </NavLink>
          <NavLink to="/admin/customers">
            <i className="ti ti-users" aria-hidden="true" /> Customers
          </NavLink>
          <NavLink to="/shop">
            <i className="ti ti-building-store" aria-hidden="true" /> View shop
          </NavLink>
        </nav>

        <div className="sidebar-foot">
          <p>
            {user?.name} <span className="role-tag">{user?.role}</span>
          </p>
          <button
            className="sidebar-signout"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            <i className="ti ti-logout" aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}