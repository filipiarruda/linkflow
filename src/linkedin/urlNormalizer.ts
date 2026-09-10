export function normalizeLinkedInUrl(value: string): string {
  if (!value) return '';
  try {
    const candidate = value.startsWith('http') ? value : `https://${value}`;
    const url = new URL(candidate);
    const match = url.pathname.match(/^\/in\/([^/?#]+)/i);
    if (!match) return value.trim().replace(/\/$/, '');
    return `https://www.linkedin.com/in/${match[1].toLowerCase()}`;
  } catch {
    return value.trim().replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
  }
}
