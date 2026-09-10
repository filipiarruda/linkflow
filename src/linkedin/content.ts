type Profile = { url: string; name: string; headline: string; company: string };
type PendingCapture = Profile & { capturedAt: string };

const PENDING_KEY = 'memoryPendingConnections';
let pendingIntent: { profile: Profile; startedAt: number } | null = null;

function cleanText(value?: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function textOf(selectors: string[], root: ParentNode = document): string {
  for (const selector of selectors) {
    const value = cleanText(root.querySelector(selector)?.textContent);
    if (value) return value;
  }
  return '';
}

function structuredProfile(): Partial<Profile> {
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || 'null');
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const person = candidates.find(item => item?.['@type'] === 'Person');
      if (person) return {
        name: cleanText(person.name),
        headline: cleanText(person.jobTitle),
        company: cleanText(person.worksFor?.name),
      };
    } catch { /* Alguns blocos estruturados não são JSON válido. */ }
  }
  return {};
}

function detectProfile(): Profile {
  const structured = structuredProfile();
  const ogTitle = cleanText(document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content);
  const titleWithoutBrand = ogTitle.replace(/\s*[|]\s*LinkedIn.*$/i, '');
  const titleParts = titleWithoutBrand.split(/\s[-–]\s/).map(cleanText).filter(Boolean);
  const metaName = titleParts[0] || cleanText(document.title.replace(/\s*[|]\s*LinkedIn.*$/i, ''));
  const metaHeadline = titleParts.slice(1).join(' · ');

  const name = textOf([
    '[data-view-name="profile-top-card"] h1',
    'main h1.text-heading-xlarge',
    'main .pv-text-details__left-panel h1',
    'main h1',
    '[data-anonymize="person-name"]',
  ]) || structured.name || metaName;

  const nameElement = document.querySelector<HTMLElement>([
    '[data-view-name="profile-top-card"] h1',
    'main h1.text-heading-xlarge',
    'main .pv-text-details__left-panel h1',
    'main h1',
  ].join(','));
  const topCard = nameElement?.closest('[data-view-name="profile-top-card"], section') ?? document;

  const headline = textOf([
    '.pv-text-details__left-panel .text-body-medium.break-words',
    '.pv-text-details__left-panel .text-body-medium',
    '.text-body-medium.break-words',
    '[data-generated-suggestion-target] + .text-body-medium',
  ], topCard) || textOf([
    '[data-view-name="profile-top-card"] .text-body-medium',
    'main .pv-text-details__left-panel .text-body-medium',
    'main .text-body-medium.break-words',
  ]) || structured.headline || metaHeadline;

  const company = textOf([
    '.pv-text-details__right-panel button',
    '.pv-text-details__right-panel a',
    'button[aria-label*="Empresa atual"]',
    'button[aria-label*="Current company"]',
    'a[href*="/company/"] span[aria-hidden="true"]',
    'a[href*="/company/"]',
  ], topCard) || structured.company || '';

  return { url: location.href, name, headline, company };
}

function normalizeUrl(value: string): string {
  try {
    const match = new URL(value).pathname.match(/^\/in\/([^/?#]+)/i);
    return match ? `https://www.linkedin.com/in/${match[1].toLowerCase()}` : value.split(/[?#]/)[0].replace(/\/$/, '');
  } catch { return value; }
}

async function enqueueConnection(profile: Profile) {
  if (!profile.name || !location.pathname.startsWith('/in/')) return;
  const normalizedUrl = normalizeUrl(profile.url);
  const stored = await chrome.storage.local.get(PENDING_KEY);
  const queue = Array.isArray(stored[PENDING_KEY]) ? stored[PENDING_KEY] as PendingCapture[] : [];
  const capture: PendingCapture = { ...profile, url: normalizedUrl, capturedAt: new Date().toISOString() };
  const next = [...queue.filter(item => normalizeUrl(item.url) !== normalizedUrl), capture];
  await chrome.storage.local.set({ [PENDING_KEY]: next });
  showCapturedToast(profile.name, normalizedUrl);
}

async function undoCapture(url: string, toast: HTMLElement) {
  const stored = await chrome.storage.local.get(PENDING_KEY);
  const queue = Array.isArray(stored[PENDING_KEY]) ? stored[PENDING_KEY] as PendingCapture[] : [];
  await chrome.storage.local.set({ [PENDING_KEY]: queue.filter(item => normalizeUrl(item.url) !== url) });
  toast.remove();
}

function showCapturedToast(name: string, url: string) {
  document.getElementById('linkflow-capture-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'linkflow-capture-toast';
  Object.assign(toast.style, {
    position: 'fixed', right: '24px', bottom: '24px', zIndex: '2147483647', display: 'flex',
    alignItems: 'center', gap: '12px', padding: '13px 15px', borderRadius: '11px',
    background: '#121820', border: '1px solid #263241', color: '#f5f7fa',
    boxShadow: '0 18px 50px rgba(0,0,0,.4)', font: '600 13px system-ui, sans-serif',
  });
  const message = document.createElement('span');
  message.textContent = `✓ ${name} foi adicionado ao LinkFlow`;
  const undo = document.createElement('button');
  undo.textContent = 'Desfazer';
  Object.assign(undo.style, { border: '0', background: 'transparent', color: '#68b9ff', cursor: 'pointer', font: '700 12px system-ui, sans-serif' });
  undo.addEventListener('click', () => void undoCapture(url, toast));
  toast.append(message, undo);
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 6000);
}

function buttonLabel(button: HTMLButtonElement): string {
  return cleanText(button.getAttribute('aria-label') || button.innerText).toLocaleLowerCase();
}

document.addEventListener('click', event => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
  if (!button || !location.pathname.startsWith('/in/')) return;
  const label = buttonLabel(button);
  const isConnect = /^(conectar|connect)$/.test(label) || /(?:conectar-se com|conectar com|convidar .* para se conectar|invite .* to connect)/.test(label);
  const isConfirm = /^(enviar|send|enviar sem nota|send without a note|enviar agora|send now)$/.test(label);
  const isCancel = /^(cancelar|cancel|agora não|not now|fechar|close)$/.test(label);

  if (isConnect) {
    const intent = { profile: detectProfile(), startedAt: Date.now() };
    pendingIntent = intent;
    window.setTimeout(() => {
      if (pendingIntent !== intent) return;
      const connectionDialog = document.querySelector('[role="dialog"]');
      if (!connectionDialog) {
        pendingIntent = null;
        void enqueueConnection(intent.profile);
      }
    }, 900);
    return;
  }
  if (isCancel) { pendingIntent = null; return; }
  if (isConfirm && pendingIntent && Date.now() - pendingIntent.startedAt < 120_000) {
    const profile = pendingIntent.profile;
    pendingIntent = null;
    window.setTimeout(() => void enqueueConnection(profile), 250);
  }
}, true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'MEMORY_GET_PROFILE') sendResponse(detectProfile());
  return false;
});
