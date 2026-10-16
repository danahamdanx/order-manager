import { pageWindow } from '../lib/pagination';

interface Props {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pages, total, pageSize, onChange }: Props) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="pager">
      <p className="muted pager-info">
        Showing {from}–{to} of {total}
      </p>
      {pages > 1 && (
        <nav aria-label="Pagination">
          <ul className="pager-list">
            <li>
              <button className="pager-btn" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
                <i className="ti ti-chevron-left" aria-hidden="true" />
              </button>
            </li>
            {pageWindow(page, pages).map((p, i) =>
              typeof p === 'number' ? (
                <li key={p}>
                  <button
                    className={`pager-btn ${p === page ? 'active' : ''}`}
                    onClick={() => onChange(p)}
                    aria-current={p === page ? 'page' : undefined}
                    aria-label={`Page ${p}`}
                  >
                    {p}
                  </button>
                </li>
              ) : (
                <li key={`gap-${i}`} className="pager-gap" aria-hidden="true">…</li>
              ),
            )}
            <li>
              <button className="pager-btn" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Next page">
                <i className="ti ti-chevron-right" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}