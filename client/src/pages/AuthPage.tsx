import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth/useAuth';
import { homeFor } from '../auth/roles';
import { Logo } from '../components/Logo';
import { AuthIllustration } from '../components/AuthIllustration';

type Mode = 'login' | 'register';

interface Errors {
  name?: string;
  email?: string;
  password?: string;
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const { user, login, register } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // إذا المستخدم مسجل دخول، بنوديه لصفحته
  if (user) {
    return <Navigate to={from && user.role === 'customer' ? from : homeFor(user.role)} replace />;
  }

  function validate(): Errors {
    const e: Errors = {};
    if (mode === 'register' && !name.trim()) e.name = 'Name is required';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email address';
    if (mode === 'register' && password.length < 8) e.password = 'Use at least 8 characters';
    if (mode === 'login' && !password) e.password = 'Password is required';
    return e;
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register({ name: name.trim(), email: email.trim(), password });
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? [err.message, ...err.details].join(': ') : 'Something went wrong');
      setSubmitting(false);
    }
  }

  const isLogin = mode === 'login';

  return (
    <div className="auth">
      <aside className="auth-aside">
        <AuthIllustration />
        <p>Shop, order and track in one place.</p>
      </aside>

      <section className="auth-main">
        <div className="auth-card">
          <Link to="/shop" className="auth-logo" aria-label="Back to the shop">
            <Logo size={36} />
          </Link>

          <div className="tabs" role="tablist">
            <Link to="/login" className={`chip ${isLogin ? 'active' : ''}`} role="tab" aria-selected={isLogin}>
              Sign in
            </Link>
            <Link to="/register" className={`chip ${!isLogin ? 'active' : ''}`} role="tab" aria-selected={!isLogin}>
              Create account
            </Link>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {!isLogin && (
              <div className="field">
                <label htmlFor="name">Full name</label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
            )}

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="name@company.com"
              />
              {errors.email && <span className="field-error">{errors.email}</span>}
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
              {errors.password && <span className="field-error">{errors.password}</span>}
            </div>

            {serverError && (
              <p className="alert-error" role="alert">
                {serverError}
              </p>
            )}

            <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
              {submitting ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {isLogin && (
            <p className="demo-note">
              Demo accounts: admin@example.com / Admin123! · lina@example.com / Customer123!
            </p>
          )}
        </div>
      </section>
    </div>
  );
}