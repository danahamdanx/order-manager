import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../api';
import { PRODUCT_COLORS, PRODUCT_ICONS } from '../types';
import type { AdminProduct } from '../types';
import { ProductTile } from './ProductTile';

interface Props {
  product: AdminProduct | null; // null يعني منتج جديد
  categories: string[];
  onClose: () => void;
  onSaved: (product: AdminProduct, isNew: boolean) => void;
}

interface Errors {
  name?: string;
  category?: string;
  price?: string;
  stock?: string;
}

export function ProductDialog({ product, categories, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [stock, setStock] = useState(product ? String(product.stock) : '');
  const [icon, setIcon] = useState(product?.icon ?? 'package');
  const [color, setColor] = useState(product?.color ?? 'teal');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // نفس شروط السيرفر، عشان المستخدم يشوف الخطأ فورًا
  function validate(): Errors {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!category.trim()) e.category = 'Category is required';
    const p = Number(price);
    if (price.trim() === '' || !Number.isFinite(p) || p <= 0 || p > 100000 || Math.round(p * 100) / 100 !== p) {
      e.price = 'Enter a price above 0 with up to 2 decimals';
    }
    const s = Number(stock);
    if (stock.trim() === '' || !Number.isInteger(s) || s < 0 || s > 100000) {
      e.stock = 'Stock must be a whole number, 0 or more';
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
    const body = {
      name: name.trim(),
      category: category.trim(),
      description: description.trim(),
      price: Number(price),
      stock: Number(stock),
      icon,
      color,
    };
    try {
      const saved = product
        ? await api.patch<AdminProduct>(`/products/${product.id}`, body)
        : await api.post<AdminProduct>('/products', body);
      onSaved(saved, product === null);
    } catch (err) {
      setServerError(err instanceof ApiError ? [err.message, ...err.details].join(': ') : 'Something went wrong');
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} className="modal modal-wide">
      <form onSubmit={handleSubmit} noValidate>
        <h2 className="page-title">{product ? `Edit ${product.name}` : 'New product'}</h2>

        <div className="dialog-preview">
          <ProductTile product={{ icon, color }} size="sm" />
          <span className="muted">Preview</span>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="p-name">Name</label>
            <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="p-category">Category</label>
            <input id="p-category" list="category-options" value={category} onChange={(e) => setCategory(e.target.value)} />
            <datalist id="category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {errors.category && <span className="field-error">{errors.category}</span>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="p-description">Description</label>
          <textarea id="p-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="p-price">Price ($)</label>
            <input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            {errors.price && <span className="field-error">{errors.price}</span>}
          </div>
          <div className="field">
            <label htmlFor="p-stock">Stock</label>
            <input id="p-stock" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
            {errors.stock && <span className="field-error">{errors.stock}</span>}
          </div>
          <div className="field">
            <label htmlFor="p-icon">Icon</label>
            <select id="p-icon" value={icon} onChange={(e) => setIcon(e.target.value)}>
              {PRODUCT_ICONS.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-color">Color</label>
            <select id="p-color" value={color} onChange={(e) => setColor(e.target.value)}>
              {PRODUCT_COLORS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
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
              {saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}
            </button>
          </span>
        </div>
      </form>
    </dialog>
  );
}