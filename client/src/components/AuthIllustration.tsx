export function AuthIllustration() {
  return (
    <svg viewBox="0 0 240 150" width="100%" style={{ maxWidth: 260 }} role="img" aria-label="Floating order cards">
      <g className="float">
        <rect x="30" y="48" width="110" height="62" rx="10" fill="#E1F5EE" />
        <rect x="42" y="62" width="50" height="7" rx="3" fill="#5DCAA5" />
        <rect x="42" y="78" width="80" height="6" rx="3" fill="#9FE1CB" />
        <rect x="42" y="92" width="36" height="6" rx="3" fill="#9FE1CB" />
      </g>
      <g className="float d1">
        <rect x="110" y="20" width="100" height="56" rx="10" fill="#FAC775" />
        <circle cx="130" cy="42" r="9" fill="#BA7517" />
        <rect x="146" y="36" width="48" height="6" rx="3" fill="#FAEEDA" />
        <rect x="146" y="50" width="32" height="6" rx="3" fill="#FAEEDA" />
      </g>
      <g className="float d2">
        <rect x="120" y="86" width="96" height="48" rx="10" fill="#FFFFFF" />
        <path d="M136 110l8 8 18-18" fill="none" stroke="#0F6E56" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="170" y="106" width="32" height="6" rx="3" fill="#9FE1CB" />
      </g>
    </svg>
  );
}