import { useId } from 'react';
import { BRAND_LABELS, detectBrand, digitsOnly, formatCardNumber, formatExpiry } from '../lib/card';
import type { CardErrors, CardFields } from '../lib/card';

interface Props {
  value: CardFields;
  errors: CardErrors;
  onChange: (value: CardFields) => void;
  disabled?: boolean;
}

export function CardForm({ value, errors, onChange, disabled }: Props) {
  const uid = useId();
  const brand = detectBrand(digitsOnly(value.number));
  const set = (patch: Partial<CardFields>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="card-form" disabled={disabled}>
      <legend>Payment</legend>
      <p className="demo-banner">
        Demo checkout: no real payment is made. Never enter a real card. Test cards: 4242 4242 4242 4242 (approved),
        4000 0000 0000 0002 (declined), 4000 0000 0000 9995 (insufficient funds). Use any future date and any code.
      </p>
      <div className="field">
        <label htmlFor={`${uid}-name`}>Name on card</label>
        <input
          id={`${uid}-name`}
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          autoComplete="cc-name"
          aria-invalid={errors.name ? true : undefined}
        />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>

      <div className="field">
        <label htmlFor={`${uid}-number`}>
          Card number {digitsOnly(value.number).length > 0 && <span className="brand-tag">{BRAND_LABELS[brand]}</span>}
        </label>
        <input
          id={`${uid}-number`}
          value={value.number}
          onChange={(e) => set({ number: formatCardNumber(e.target.value) })}
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
          aria-invalid={errors.number ? true : undefined}
        />
        {errors.number && <span className="field-error">{errors.number}</span>}
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${uid}-expiry`}>Expiry</label>
          <input
            id={`${uid}-expiry`}
            value={value.expiry}
            onChange={(e) => set({ expiry: formatExpiry(e.target.value) })}
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            aria-invalid={errors.expiry ? true : undefined}
          />
          {errors.expiry && <span className="field-error">{errors.expiry}</span>}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-cvc`}>Security code</label>
          <input
            id={`${uid}-cvc`}
            value={value.cvc}
            onChange={(e) => set({ cvc: digitsOnly(e.target.value).slice(0, 4) })}
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            aria-invalid={errors.cvc ? true : undefined}
          />
          {errors.cvc && <span className="field-error">{errors.cvc}</span>}
        </div>
      </div>
    </fieldset>
  );
}