import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth/useAuth';
import { ProductDialog } from '../../components/ProductDialog';
import { money } from '../../lib/format';
import type { AdminProduct } from '../../types';
import { ProductImage } from '../../components/ProductImage';

export default function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ product: AdminProduct | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<AdminProduct[]>('/admin/products', controller.signal)
      .then(setProducts)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (showArchived || p.active) &&
        (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)),
    );
  }, [products, search, showArchived]);

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  }

  async function toggleActive(p: AdminProduct) {
    setActionError(null);
    try {
      const updated = await api.patch<AdminProduct>(`/products/${p.id}`, { active: !p.active });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
      flash(updated.active ? `${p.name} restored` : `${p.name} archived`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the product');
    }
  }

  async function remove(p: AdminProduct) {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await api.delete(`/products/${p.id}`);
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
      flash(`${p.name} deleted`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the product');
    }
  }

    function handleSaved(saved: AdminProduct, isNew: boolean, imageError?: string) {
    setProducts((prev) => (isNew ? [...prev, saved] : prev.map((x) => (x.id === saved.id ? saved : x))));
    setDialog(null);
    if (imageError) {
      setActionError(`${saved.name} was saved, but the image could not be uploaded: ${imageError}`);
    } else {
      flash(isNew ? `${saved.name} added` : `${saved.name} updated`);
    }
  }

  return (
    <>
      <div className="admin-head">
        <h1 className="page-title">Products</h1>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setDialog({ product: null })}>
            <i className="ti ti-plus" aria-hidden="true" /> New product
          </button>
        )}
      </div>

      <div className="controls">
        <input
          className="search"
          type="search"
          placeholder="Search by name or category"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products"
        />
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived products
        </label>
      </div>

      {!isAdmin && <p className="muted">You have view-only access. Ask an admin to change products.</p>}
      {notice && <p className="success" role="status">{notice}</p>}
      {actionError && <p className="alert-error" role="alert">{actionError}</p>}
      {loading && <p className="muted">Loading products…</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {!loading && !error && visible.length === 0 && <p className="muted">No products found.</p>}

      {!loading && !error && visible.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className={p.active ? '' : 'row-muted'}>
                  <td>
                    <div className="cell-product">
                      <ProductImage product={p} size="sm" />
                      <strong>{p.name}</strong>
                    </div>
                  </td>
                  <td>{p.category}</td>
                  <td>{money(p.price)}</td>
                  <td>
                    {p.stock}{' '}
                    {p.stock === 0 ? (
                      <span className="badge badge-cancelled">Out</span>
                    ) : p.stock <= 5 ? (
                      <span className="badge badge-low">Low</span>
                    ) : null}
                  </td>
                  <td>
                    <span className={`badge ${p.active ? 'badge-ok' : 'badge-muted'}`}>
                      {p.active ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="actions-cell">
                      <button className="link-btn link-brand" onClick={() => setDialog({ product: p })} aria-label={`Edit ${p.name}`}>
                        Edit
                      </button>
                      <button className="link-btn link-brand" onClick={() => toggleActive(p)}>
                        {p.active ? 'Archive' : 'Restore'}
                      </button>
                      <button className="link-btn" onClick={() => remove(p)} aria-label={`Delete ${p.name}`}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <ProductDialog
          key={dialog.product?.id ?? 'new'}
          product={dialog.product}
          categories={categories}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}