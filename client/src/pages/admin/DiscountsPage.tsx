import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth/useAuth';
import { DiscountDialog } from '../../components/DiscountDialog';
import { Pagination } from '../../components/Pagination';
import { formatDate, money } from '../../lib/format';
import { usePagedFetch } from '../../lib/usePagedFetch';
import { useUrlParams } from '../../lib/useUrlParams';
import type { DiscountCode } from '../../types';

const DEFAULTS = { page: '1' };
const PAGE_SIZE = 10;

const STATUS_CLASS: Record<DiscountCode['status'], string> = {
  active: 'badge-ok',
  expired: 'badge-muted',
  exhausted: 'badge-low',
  disabled: 'badge-muted',
};

export default function DiscountsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { values, update } = useUrlParams(DEFAULTS);
  const { data, loading, error, reload } = usePagedFetch<DiscountCode>('/admin/discounts', {
    page: values.page,
    limit: String(PAGE_SIZE),
  });

  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  }

  async function toggle(d: DiscountCode) {
    setActionError(null);
    try {
      await api.patch<DiscountCode>(`/discounts/${d.id}`, { active: !d.active });
      reload();
      flash(d.active ? `${d.code} disabled` : `${d.code} enabled`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the code');
    }
  }

  return (
    <>
      <div className="admin-head">
        <h1 className="page-title">Discount codes</h1>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <i className="ti ti-plus" aria-hidden="true" /> New code
          </button>
        )}
      </div>

      {!isAdmin && <p className="muted">You have view-only access. Ask an admin to change codes.</p>}
      {notice && <p className="success" role="status">{notice}</p>}
      {actionError && <p className="alert-error" role="alert">{actionError}</p>}
      {!data && loading && <p className="muted">Loading codes…</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {data && data.items.length === 0 && <p className="muted">No discount codes yet.</p>}

      {data && data.items.length > 0 && (
        <div className={`card table-wrap ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Used</th>
                <th>Expires</th>
                <th>Status</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id} className={d.status === 'active' ? '' : 'row-muted'}>
                  <td><strong>{d.code}</strong></td>
                  <td>{d.type === 'percent' ? `${d.value}%` : money(d.value)}</td>
                  <td>{d.timesUsed} / {d.usageLimit ?? 'unlimited'}</td>
                  <td>{d.expiresAt ? formatDate(d.expiresAt) : 'Never'}</td>
                  <td><span className={`badge ${STATUS_CLASS[d.status]}`}>{d.status}</span></td>
                  {isAdmin && (
                    <td className="actions-cell">
                      <button className="link-btn link-brand" onClick={() => toggle(d)}>
                        {d.active ? 'Disable' : 'Enable'}
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

      {creating && (
        <DiscountDialog
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            reload();
            flash(`${saved.code} created`);
          }}
        />
      )}
    </>
  );
}