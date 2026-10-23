import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../api';
import type { DiscountCode } from '../types';

interface Props {
  onClose: () => void;
  onSaved: (code: DiscountCode) => void;
}

interface Errors {
  code?: string;
  value?: string;
  expires?: string;
  limit?: string;
}

// التاريخ بيعني آخر لحظة من هاليوم بتوقيتك المحلي
const endOfDay = (date: string) => new Date(`${date}T23:59:59`);
const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export function DiscountDialog({ onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');
  const [expires, setExpires] = useState('');
  const [limit, setLimit] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function validate(): Errors {
    const e: Errors = {};
    if (!/^[A-Z0-9_-]{3,32}$/.test(code.trim().toUpperCase())) e.code = 'Use 3 to 32 letters, digits, - or _';

    const v = Number(value);
    const max = type === 'percent' ? 100 : 100000;
    if (value.trim() === '' || !Number.isFinite(v) || v <= 0 || Math.round(v * 100) / 100 !== v) {
      e.value = 'Enter a number above 0 with up to 2 decimals';
    } else if (v > max) {
      e.value = type === 'percent' ? 'A percent discount cannot be above 100' : 'The amount is too large';
    }

    if (expires && endOfDay(expires).getTime() <= Date.now()) e.expires = 'Choose a date in the future';

    const l = Number(limit);
    if (limit.trim() !== '' && (!Number.isInteger(l) || l < 1 || l > 1_000_000)) {
      e.limit = 'Use a whole number of 1 or more';
    }
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
      const saved = await api.post<DiscountCode>('/discounts', {
        code: code.trim().toUpperCase(),
        type,
        value: Number(value),
        expiresAt: expires ? endOfDay(expires).toISOString() : undefined,
        usageLimit: limit.trim() ? Number(limit) : undefined,
      });
      onSaved(saved);
    } catch (err) {
      setServerError(err instanceof ApiError ? [err.message, ...err.details].join(': ') : 'Something went wrong');
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} className="modal">
      <form onSubmit={handleSubmit} noValidate>
        <h2 className="page-title">New discount code</h2>

        <div className="field">
          <label htmlFor="d-code">Code</label>
          <input id="d-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" />
          {errors.code && <span className="field-error">{errors.code}</span>}
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="d-type">Type</label>
            <select id="d-type" value={type} onChange={(e) => setType(e.target.value as 'percent' | 'amount')}>
              <option value="percent">Percent off</option>
              <option value="amount">Amount off ($)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-value">{type === 'percent' ? 'Percent' : 'Amount ($)'}</label>
            <input id="d-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            {errors.value && <span className="field-error">{errors.value}</span>}
          </div>
          <div className="field">
            <label htmlFor="d-expires">Expires (optional)</label>
            <input id="d-expires" type="date" min={todayLocal()} value={expires} onChange={(e) => setExpires(e.target.value)} />
            {errors.expires && <span className="field-error">{errors.expires}</span>}
          </div>
          <div className="field">
            <label htmlFor="d-limit">Usage limit (optional)</label>
            <input id="d-limit" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
            {errors.limit && <span className="field-error">{errors.limit}</span>}
          </div>
        </div>

        {serverError && <p className="alert-error" role="alert">{serverError}</p>}

        <div className="modal-actions">
          <span />
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Create code'}
            </button>
          </span>
        </div>
      </form>
    </dialog>
  );
}