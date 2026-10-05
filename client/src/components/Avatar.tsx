import { avatarColors, initials } from '../lib/format';

export function Avatar({ id, name, size = 40 }: { id: number; name: string; size?: number }) {
  const c = avatarColors(id);
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, background: c.bg, color: c.fg }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}