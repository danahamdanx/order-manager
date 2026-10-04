import type { Product } from '../types';

const PALETTE: Record<string, { bg: string; fg: string }> = {
  purple: { bg: '#CECBF6', fg: '#3C3489' },
  blue: { bg: '#B5D4F4', fg: '#0C447C' },
  amber: { bg: '#FAC775', fg: '#633806' },
  teal: { bg: '#9FE1CB', fg: '#085041' },
  coral: { bg: '#F5C4B3', fg: '#712B13' },
  pink: { bg: '#F4C0D1', fg: '#72243E' },
};

interface Props {
  product: Pick<Product, 'icon' | 'color'>;
  size?: 'sm' | 'md' | 'lg';
}

export function ProductTile({ product, size = 'md' }: Props) {
  const c = PALETTE[product.color] ?? PALETTE.teal;
  return (
    <div className={`tile tile-${size}`} style={{ background: c.bg, color: c.fg }} aria-hidden="true">
      <i className={`ti ti-${product.icon}`} />
    </div>
  );
}