import { STATUSES } from '../types';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function StatusFilter({ value, onChange }: Props) {
  const options = ['', ...STATUSES];
  return (
    <div className="filters" role="group" aria-label="Filter by status">
      {options.map((s) => (
        <button
          key={s || 'all'}
          className={`chip ${value === s ? 'active' : ''}`}
          aria-pressed={value === s}
          onClick={() => onChange(s)}
        >
          {s || 'all'}
        </button>
      ))}
    </div>
  );
}