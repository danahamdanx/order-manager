interface Props {
  size?: number;
  withText?: boolean;
  variant?: 'color' | 'light';
}

export function Logo({ size = 32, withText = true, variant = 'color' }: Props) {
  const bg = variant === 'color' ? '#0F6E56' : '#E1F5EE';
  const stroke = variant === 'color' ? '#FFFFFF' : '#0F6E56';
  return (
    <span className={`logo logo-${variant}`}>
      <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="OrderDesk logo">
        <rect width="32" height="32" rx="8" fill={bg} />
        <path
          d="M8 12l8-4 8 4v9l-8 4-8-4zM8 12l8 4 8-4M16 16v9"
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="9" r="4" fill="#EF9F27" />
      </svg>
      {withText && <span className="logo-text">OrderDesk</span>}
    </span>
  );
}