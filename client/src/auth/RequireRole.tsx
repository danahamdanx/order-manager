import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '../types';
import { Logo } from '../components/Logo';
import { useAuth } from './useAuth';
import { homeFor } from './roles';

export function RequireRole({ roles }: { roles: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="splash">
        <Logo size={56} withText={false} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}