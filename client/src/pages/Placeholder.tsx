export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="card">
      <h1 className="page-title">{title}</h1>
      <p className="muted">This page is coming soon.</p>
    </div>
  );
}