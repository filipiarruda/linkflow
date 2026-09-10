import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { db } from '../../db/database';
import { findContactByUrl, syncPendingConnections, saveContact, saveOpportunity, setContactStatus, type ContactInput } from '../../db/repository';
import type { Contact, ContactStatus, DetectedProfile, Opportunity } from '../../types';
import { STATUS_LABELS } from '../../types';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/Button';
import { ContactForm, type ContactFormValue } from '../../components/ContactForm';
import { StatusBadge } from '../../components/StatusBadge';
import '../../styles.css';
import './popup.css';

function detectProfileFromPage(): DetectedProfile {
  const clean = (value?: string | null) => value?.replace(/\s+/g, ' ').trim() ?? '';
  const firstText = (selectors: string[], root: ParentNode = document) => {
    for (const selector of selectors) {
      const value = clean(root.querySelector(selector)?.textContent);
      if (value) return value;
    }
    return '';
  };
  const ogTitle = clean(document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content);
  const titleWithoutBrand = ogTitle.replace(/\s*[|]\s*LinkedIn.*$/i, '');
  const titleParts = titleWithoutBrand.split(/\s[-–]\s/).map(clean).filter(Boolean);
  const name = firstText([
    '[data-view-name="profile-top-card"] h1',
    'main h1.text-heading-xlarge',
    'main .pv-text-details__left-panel h1',
    'main h1',
    '[data-anonymize="person-name"]',
  ]) || titleParts[0] || clean(document.title.replace(/\s*[|]\s*LinkedIn.*$/i, ''));
  const nameElement = document.querySelector<HTMLElement>([
    '[data-view-name="profile-top-card"] h1',
    'main h1.text-heading-xlarge',
    'main .pv-text-details__left-panel h1',
    'main h1',
  ].join(','));
  const topCard = nameElement?.closest('[data-view-name="profile-top-card"], section') ?? document;
  return {
    url: location.href,
    name,
    headline: firstText([
      '.pv-text-details__left-panel .text-body-medium.break-words',
      '.pv-text-details__left-panel .text-body-medium',
      '.text-body-medium.break-words',
    ], topCard) || firstText(['[data-view-name="profile-top-card"] .text-body-medium', 'main .text-body-medium.break-words']) || titleParts.slice(1).join(' · '),
    company: firstText([
      '.pv-text-details__right-panel button',
      '.pv-text-details__right-panel a',
      'button[aria-label*="Empresa atual"]',
      'button[aria-label*="Current company"]',
      'a[href*="/company/"] span[aria-hidden="true"]',
      'a[href*="/company/"]',
    ], topCard),
  };
}

function Popup() {
  const [detected, setDetected] = useState<DetectedProfile>();
  const [contact, setContact] = useState<Contact>();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [opportunityId, setOpportunityId] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const capturedCount = await syncPendingConnections();
      if (capturedCount) setNotice(`${capturedCount} conexão(ões) sincronizada(s) com o CRM.`);
      setOpportunities(await db.opportunities.where('status').equals('active').reverse().sortBy('updatedAt'));
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.includes('linkedin.com/in/')) {
        setError('Abra um perfil do LinkedIn para registrar ou consultar um contato.');
        return;
      }
      let profile: DetectedProfile = { url: tab.url, name: '', headline: '', company: '' };
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'MEMORY_GET_PROFILE' }) as Partial<DetectedProfile> | undefined;
        if (response) profile = {
          url: response.url || profile.url,
          name: response.name || profile.name,
          headline: response.headline || profile.headline,
          company: response.company || profile.company,
        };
      } catch { /* Uma aba antiga pode ainda não ter o content script injetado. */ }

      if (!profile.name || !profile.headline || !profile.company) {
        try {
          const [execution] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: detectProfileFromPage });
          const fallback = execution?.result;
          if (fallback) profile = {
            url: fallback.url || profile.url,
            name: profile.name || fallback.name,
            headline: profile.headline || fallback.headline,
            company: profile.company || fallback.company,
          };
        } catch { /* A URL ainda permite o cadastro manual. */ }
      }
      setDetected(profile);
      const saved = await findContactByUrl(profile.url);
      setContact(saved);
      if (saved) {
        const relation = await db.contactOpportunities.where('contactId').equals(saved.id).first();
        setOpportunityId(relation?.opportunityId ?? '');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível ler os dados locais.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const submit = async (value: ContactFormValue, selectedOpportunityId: string, newOpportunity?: { title: string; company: string }) => {
    let relationId = selectedOpportunityId;
    if (newOpportunity) relationId = (await saveOpportunity(newOpportunity)).id;
    const saved = await saveContact(value as ContactInput, relationId);
    setContact(saved);
    setOpportunityId(relationId);
    setOpportunities(await db.opportunities.where('status').equals('active').reverse().sortBy('updatedAt'));
    setEditing(false);
    setNotice('Contato salvo somente neste navegador.');
    window.setTimeout(() => setNotice(''), 2500);
  };

  const changeStatus = async (status: ContactStatus) => {
    if (!contact) return;
    setContact(await setContactStatus(contact, status));
    setNotice(`Status atualizado para ${STATUS_LABELS[status]}.`);
  };

  const openDashboard = () => chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${contact ? `?contact=${contact.id}` : ''}`) });

  return (
    <main className="popup">
      <header className="popup__header"><Logo /><button className="icon-button" onClick={openDashboard} title="Abrir CRM">↗</button></header>
      {loading && <div className="popup__loading"><span className="spinner" />Lendo perfil…</div>}
      {!loading && error && <div className="popup__message"><div className="message-icon">in</div><h2>Perfil não identificado</h2><p>{error}</p><Button onClick={openDashboard}>Abrir dashboard</Button></div>}
      {!loading && !error && !contact && detected && <>
        <div className="popup__intro"><span className="eyebrow">NOVO CONTATO</span><h1>{detected.name || 'Registrar perfil'}</h1><p>{detected.headline || 'Complete os dados e preserve o contexto desta conexão.'}</p></div>
        <ContactForm compact detected={detected} opportunities={opportunities} onSubmit={submit} />
      </>}
      {!loading && contact && !editing && <>
        <section className="profile-summary">
          <div className="profile-summary__top"><span className="avatar">{contact.name.slice(0, 1).toUpperCase()}</span><div><span className="eyebrow">CONTATO SALVO</span><h1>{contact.name}</h1><p>{[contact.jobTitle, contact.company].filter(Boolean).join(' · ')}</p></div></div>
          <StatusBadge status={contact.status} />
        </section>
        <section className="memory-card"><span>POR QUE ADICIONEI?</span><p>{contact.reason || 'Nenhum contexto registrado.'}</p></section>
        {opportunityId && <section className="detail-row"><span>Oportunidade</span><strong>{opportunities.find(item => item.id === opportunityId)?.title ?? 'Oportunidade relacionada'}</strong></section>}
        <label className="quick-status">Atualizar status<select value={contact.status} onChange={e => void changeStatus(e.target.value as ContactStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="popup__actions"><Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button><Button onClick={openDashboard}>Abrir no CRM</Button></div>
      </>}
      {!loading && contact && editing && <ContactForm compact contact={contact} opportunities={opportunities} initialOpportunityId={opportunityId} onSubmit={submit} onCancel={() => setEditing(false)} />}
      {notice && <div className="toast">✓ {notice}</div>}
      <footer><span className="privacy-dot" /> Dados armazenados localmente</footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Popup /></StrictMode>);
