import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, updateOrder } from '../api';
import { STATUSES } from '../types';
import type { Order, Status } from '../types';

interface Props {
  order: Order;
  onClose: () => void;
  onSaved: (order: Order) => void;
}

interface FormErrors {
  customerName?: string;
  product?: string;
  total?: string;
}

export function EditOrderModal({ order, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [customerName, setCustomerName] = useState(order.customerName);
  const [product, setProduct] = useState(order.product);
  const [total, setTotal] = useState(String(order.total));
  const [status, setStatus] = useState<Status>(order.status);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // بنفتح الـ dialog أول ما يظهر الـ component
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!customerName.trim()) e.customerName = 'Customer name is required';
    if (!product.trim()) e.product = 'Product is required';
    const n = Number(total);
    if (total.trim() === '' || Number.isNaN(n) || n <= 0) e.total = 'Total must be a number greater than 0';
    return e;
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const updated = await updateOrder(order.id, {
        customerName: customerName.trim(),
        product: product.trim(),
        total: Number(total),
        status,
      });
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError([err.message, ...err.details].join(': '));
      } else {
        setServerError('Cannot reach the server.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="modal">
      <form onSubmit={handleSubmit} noValidate>
        <h2>Edit order #{order.id}</h2>

        <label>
          Customer
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          {errors.customerName && <span className="field-error">{errors.customerName}</span>}
        </label>

        <label>
          Product
          <input value={product} onChange={(e) => setProduct(e.target.value)} />
          {errors.product && <span className="field-error">{errors.product}</span>}
        </label>

        <label>
          Total ($)
          <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" />
          {errors.total && <span className="field-error">{errors.total}</span>}
        </label>

        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {serverError && <p className="error" role="alert">{serverError}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={() => dialogRef.current?.close()} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </dialog>
  );
}