export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M7 7.8h10M7 12h7M7 16.2h4"/><path d="M4 4h16v16H4z"/></svg>
      </span>
      {!compact && <span>Link<b>Flow</b></span>}
    </div>
  );
}
