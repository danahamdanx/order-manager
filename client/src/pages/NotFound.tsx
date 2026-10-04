import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="splash">
      <div className="card" style={{ textAlign: 'center' }}>
        <h1 className="page-title">Page not found</h1>
        <p className="muted">The page you are looking for does not exist.</p>
        <Link to="/shop" className="btn btn-primary">
          Back to the shop
        </Link>
      </div>
    </div>
  );
}