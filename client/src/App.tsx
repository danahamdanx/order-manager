import { useEffect, useState } from 'react';
import { fetchOrders } from './api';
import type { Order } from './types';
import { OrderTable } from './components/OrderTable';
import { StatusFilter } from './components/StatusFilter';
import { EditOrderModal } from './components/EditOrderModal';

export default function App() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Order | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchOrders({ status, search: debouncedSearch }, controller.signal)
      .then(setOrders)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof TypeError ? 'Cannot reach the server.' : err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [status, debouncedSearch]);

  // بعد الحفظ: بنحدّث الطلب بالقائمة مباشرة بدون طلب جديد للسيرفر
  function handleSaved(updated: Order) {
    setOrders((prev) =>
      prev
        .map((o) => (o.id === updated.id ? updated : o))
        // إذا غيّرنا الحالة وصارت ما بتطابق الفلتر الحالي، بنشيله من القائمة
        .filter((o) => !status || o.status === status),
    );
    setEditing(null);
    setNotice(`Order #${updated.id} updated`);
    setTimeout(() => setNotice(null), 3000);
  }

  return (
    <main className="container">
      <h1>Orders</h1>

      <div className="controls">
        <input
          type="search"
          placeholder="Search by customer, product or ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search orders"
        />
        <StatusFilter value={status} onChange={setStatus} />
      </div>

      {notice && <p className="success" role="status">{notice}</p>}
      {loading && <p className="note">Loading orders…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && !error && orders.length === 0 && <p className="note">No orders found.</p>}
      {!loading && !error && orders.length > 0 && <OrderTable orders={orders} onEdit={setEditing} />}

      {editing && (
        <EditOrderModal order={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}
    </main>
  );
}