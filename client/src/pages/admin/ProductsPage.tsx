import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth/useAuth';
import { Pagination } from '../../components/Pagination';
import { ProductDialog } from '../../components/ProductDialog';
import { ProductImage } from '../../components/ProductImage';
import { money } from '../../lib/format';
import { useDebounce } from '../../lib/useDebounce';
import { usePagedFetch } from '../../lib/usePagedFetch';
import { useUrlParams } from '../../lib/useUrlParams';
import type { AdminProduct, Category } from '../../types';

const DEFAULTS = { q: '', archived: '', page: '1' };
const PAGE_SIZE = 10;

export default function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { values, update } = useUrlParams(DEFAULTS);
  const search = useDebounce(values.q, 300);

  const { data, loading, error, reload } = usePagedFetch<AdminProduct>('/admin/products', {
    search: search.trim(),
    includeArchived: values.archived ? 'true' : '',
    page: values.page,
    limit: String(PAGE_SIZE),
  });

  const [categories, setCategories] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ product: AdminProduct | null } | null>(null);

  // اقتراحات التصنيفات بنافذة الإضافة
  useEffect(() => {
    api
      .get<Category[]>('/categories')
      .then((list) => setCategories(list.map((c) => c.name)))
      .catch(() => {
        // الاقتراحات اختيارية
      });
  }, []);

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  }

  async function toggleActive(p: AdminProduct) {
    setActionError(null);
    try {
      const updated = await api.patch<AdminProduct>(`/products/${p.id}`, { active: !p.active });
      reload();
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
      reload();
      flash(`${p.name} deleted`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the product');
    }
  }

  function handleSaved(saved: AdminProduct, isNew: boolean, imageError?: string) {
    setDialog(null);
    reload();
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
          value={values.q}
          onChange={(e) => update({ q: e.target.value }, { replace: true })}
          aria-label="Search products"
        />
        <label className="check">
          <input
            type="checkbox"
            checked={values.archived === '1'}
            onChange={(e) => update({ archived: e.target.checked ? '1' : '' })}
          />
          Show archived products
        </label>
      </div>

      {!isAdmin && <p className="muted">You have view-only access. Ask an admin to change products.</p>}
      {notice && <p className="success" role="status">{notice}</p>}
      {actionError && <p className="alert-error" role="alert">{actionError}</p>}
      {!data && loading && <p className="muted">Loading products…</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {data && data.items.length === 0 && <p className="muted">No products found.</p>}

      {data && data.items.length > 0 && (
        <div className={`card table-wrap ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Views</th>
                <th>Status</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
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
                  <td>{p.views ?? 0}</td>
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

      {data && (
        <Pagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          pageSize={PAGE_SIZE}
          onChange={(page) => update({ page: String(page) })}
        />
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