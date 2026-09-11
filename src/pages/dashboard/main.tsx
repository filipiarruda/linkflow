import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { db } from '../../db/database';
import { removeContact, syncPendingConnections, saveContact, saveOpportunity, setContactStatus, type ContactInput } from '../../db/repository';
import type { Contact, ContactOpportunity, ContactStatus, Interaction, Opportunity } from '../../types';
import { CONTACT_STATUSES, STATUS_LABELS } from '../../types';
import { ContactForm, type ContactFormValue } from '../../components/ContactForm';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Logo } from '../../components/Logo';
import { StatusBadge } from '../../components/StatusBadge';
import '../../styles.css';
import './dashboard.css';

type View = 'contacts' | 'kanban' | 'opportunities' | 'settings';
type Backup = { version: 1; exportedAt: string; contacts: Contact[]; opportunities: Opportunity[]; contactOpportunities: ContactOpportunity[]; interactions: Interaction[] };

const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const isDue = (value?: string) => Boolean(value && new Date(value) <= new Date());
const compactName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 2 ? `${parts[0]} ${parts.at(-1)}` : parts.join(' ');
};

function Dashboard() {
  const [view, setView] = useState<View>('contacts');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [relations, setRelations] = useState<ContactOpportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ContactStatus | 'all'>('all');
  const [editing, setEditing] = useState<Contact | null | 'new'>(null);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [creatingOpportunity, setCreatingOpportunity] = useState(false);
  const [notice, setNotice] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    await syncPendingConnections();
    const [allContacts, allOpportunities, allRelations, allInteractions] = await Promise.all([
      db.contacts.orderBy('updatedAt').reverse().toArray(),
      db.opportunities.orderBy('updatedAt').reverse().toArray(),
      db.contactOpportunities.toArray(),
      db.interactions.orderBy('createdAt').reverse().toArray(),
    ]);
    setContacts(allContacts); setOpportunities(allOpportunities); setRelations(allRelations); setInteractions(allInteractions);
    if (selected) setSelected(allContacts.find(item => item.id === selected.id) ?? null);
  };

  useEffect(() => {
    void load().then(() => {
      const contactId = new URLSearchParams(location.search).get('contact');
      if (contactId) void db.contacts.get(contactId).then(contact => contact && setSelected(contact));
    });
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return contacts.filter(contact => {
      if (status !== 'all' && contact.status !== status) return false;
      if (!term) return true;
      const opportunityNames = relations.filter(r => r.contactId === contact.id).map(r => opportunities.find(o => o.id === r.opportunityId)?.title ?? '');
      return [contact.name, contact.company, contact.jobTitle, contact.reason, contact.notes, ...opportunityNames].join(' ').toLocaleLowerCase('pt-BR').includes(term);
    });
  }, [contacts, opportunities, relations, query, status]);

  const counts = {
    total: contacts.length,
    waiting: contacts.filter(c => c.status === 'invitation_sent').length,
    toContact: contacts.filter(c => ['connected', 'message_pending'].includes(c.status)).length,
    followUps: contacts.filter(c => isDue(c.nextFollowUpAt)).length,
    activeOpportunities: opportunities.filter(o => o.status === 'active').length,
  };

  const relationFor = (contactId: string) => relations.find(item => item.contactId === contactId)?.opportunityId ?? '';
  const opportunityFor = (contactId: string) => opportunities.find(item => item.id === relationFor(contactId));
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2500); };

  const submitContact = async (value: ContactFormValue, opportunityId: string, newOpportunity?: { title: string; company: string }) => {
    let relationId = opportunityId;
    if (newOpportunity) relationId = (await saveOpportunity(newOpportunity)).id;
    await saveContact(value as ContactInput, relationId);
    setEditing(null); await load(); flash('Contato salvo com sucesso.');
  };

  const updateStatus = async (contact: Contact, next: ContactStatus) => {
    await setContactStatus(contact, next); await load(); flash('Status atualizado.');
  };

  const confirmDelete = async (contact: Contact) => {
    if (!window.confirm(`Remover ${contact.name} e seu histórico local?`)) return;
    await removeContact(contact.id); setSelected(null); await load(); flash('Contato removido.');
  };

  const exportBackup = async () => {
    const backup: Backup = { version: 1, exportedAt: new Date().toISOString(), contacts: await db.contacts.toArray(), opportunities: await db.opportunities.toArray(), contactOpportunities: await db.contactOpportunities.toArray(), interactions: await db.interactions.toArray() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'linkflow-backup.json'; anchor.click(); URL.revokeObjectURL(url);
    flash('Backup exportado.');
  };

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Backup>;
      if (parsed.version !== 1 || !Array.isArray(parsed.contacts) || !Array.isArray(parsed.opportunities) || !Array.isArray(parsed.contactOpportunities) || !Array.isArray(parsed.interactions)) throw new Error('Formato de backup inválido.');
      const replace = window.confirm('OK: substituir todos os dados locais.\nCancelar: mesclar o backup com os dados atuais.');
      if (replace && !window.confirm('Confirma a substituição? Esta ação removerá os dados atuais antes da importação.')) return;
      await db.transaction('rw', db.contacts, db.opportunities, db.contactOpportunities, db.interactions, async () => {
        if (replace) await Promise.all([db.contacts.clear(), db.opportunities.clear(), db.contactOpportunities.clear(), db.interactions.clear()]);
        await db.contacts.bulkPut(parsed.contacts!);
        await db.opportunities.bulkPut(parsed.opportunities!);
        await db.contactOpportunities.bulkPut(parsed.contactOpportunities!);
        await db.interactions.bulkPut(parsed.interactions!);
      });
      await load(); flash(replace ? 'Backup restaurado.' : 'Backup mesclado.');
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Não foi possível importar o arquivo.'); }
    if (importRef.current) importRef.current.value = '';
  };

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Logo />
        <nav>
          <button className={view === 'contacts' ? 'active' : ''} onClick={() => setView('contacts')}><span>⌂</span> Contatos <small>{contacts.length}</small></button>
          <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}><span>▦</span> Kanban <small>{contacts.length}</small></button>
          <button className={view === 'opportunities' ? 'active' : ''} onClick={() => setView('opportunities')}><span>◇</span> Oportunidades <small>{counts.activeOpportunities}</small></button>
          <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><span>⚙</span> Dados e privacidade</button>
        </nav>
        <div className="sidebar__privacy"><span>●</span><div><strong>100% local</strong><small>Nenhum dado sai deste navegador.</small></div></div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">MEMÓRIA PROFISSIONAL</span><h1>{view === 'contacts' ? 'Seus contatos' : view === 'kanban' ? 'Funil Kanban' : view === 'opportunities' ? 'Oportunidades' : 'Dados e privacidade'}</h1></div>
          {(view === 'contacts' || view === 'kanban') && <Button onClick={() => setEditing('new')}>+ Novo contato</Button>}
          {view === 'opportunities' && <Button onClick={() => setCreatingOpportunity(true)}>+ Nova oportunidade</Button>}
        </header>

        {view === 'contacts' && <>
          <section className="stats-grid">
            <Stat label="Contatos" value={counts.total} tone="blue" />
            <Stat label="Aguardando conexão" value={counts.waiting} />
            <Stat label="Para contatar" value={counts.toContact} tone="green" />
            <Stat label="Follow-ups" value={counts.followUps} tone="yellow" />
            <Stat label="Vagas ativas" value={counts.activeOpportunities} />
          </section>
          <section className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome, empresa, vaga ou contexto…" /></div><select value={status} onChange={e => setStatus(e.target.value as ContactStatus | 'all')}><option value="all">Todos os status</option>{CONTACT_STATUSES.map(item => <option value={item} key={item}>{STATUS_LABELS[item]}</option>)}</select></section>
          <section className="contact-list">
            <div className="list-header"><span>Contato</span><span>Contexto</span><span>Status</span><span>Próxima ação</span><span /></div>
            {filtered.map(contact => <ContactRow key={contact.id} contact={contact} opportunity={opportunityFor(contact.id)} onSelect={() => setSelected(contact)} onStatus={next => void updateStatus(contact, next)} />)}
            {!filtered.length && <EmptyState title="Nenhum contato encontrado" description={contacts.length ? 'Ajuste a busca ou os filtros.' : 'Abra um perfil no LinkedIn ou crie seu primeiro contato aqui.'} />}
          </section>
        </>}


        {view === 'kanban' && <KanbanBoard
          contacts={contacts}
          opportunityFor={opportunityFor}
          onMove={(contact, next) => void updateStatus(contact, next)}
          onSelect={setSelected}
        />}
        {view === 'opportunities' && <section className="opportunity-grid">
          {opportunities.map(opportunity => {
            const contactIds = relations.filter(r => r.opportunityId === opportunity.id).map(r => r.contactId);
            const linked = contacts.filter(c => contactIds.includes(c.id));
            return <article className="opportunity-card" key={opportunity.id}><div className="opportunity-card__head"><span className="opportunity-icon">◇</span><StatusPill value={opportunity.status} /></div><h2>{opportunity.title}</h2><p>{opportunity.company || 'Empresa não informada'}</p><div className="opportunity-metrics"><span><b>{linked.length}</b> contatos</span><span><b>{linked.filter(c => ['connected','message_pending','message_sent','replied','conversation'].includes(c.status)).length}</b> conexões</span><span><b>{linked.filter(c => ['replied','conversation'].includes(c.status)).length}</b> respostas</span></div>{opportunity.url && <a href={opportunity.url} target="_blank" rel="noreferrer">Abrir vaga ↗</a>}</article>;
          })}
          {!opportunities.length && <EmptyState title="Nenhuma oportunidade" description="Agrupe seus contatos por vaga ou objetivo profissional." />}
        </section>}

        {view === 'settings' && <section className="settings-card"><div className="settings-icon">⌁</div><div><h2>Seus dados são seus</h2><p>Contatos, oportunidades e histórico ficam armazenados no IndexedDB deste navegador. A extensão não possui servidor, analytics ou telemetria.</p></div><div className="settings-actions"><Button onClick={() => void exportBackup()}>Exportar backup</Button><Button variant="secondary" onClick={() => importRef.current?.click()}>Importar backup</Button><input ref={importRef} hidden type="file" accept="application/json" onChange={e => e.target.files?.[0] && void importBackup(e.target.files[0])} /></div></section>}
      </main>

      {editing && <Modal title={editing === 'new' ? 'Novo contato' : 'Editar contato'} onClose={() => setEditing(null)}><ContactForm contact={editing === 'new' ? undefined : editing} opportunities={opportunities.filter(o => o.status === 'active')} initialOpportunityId={editing === 'new' ? '' : relationFor(editing.id)} onSubmit={submitContact} onCancel={() => setEditing(null)} /></Modal>}
      {creatingOpportunity && <OpportunityModal onClose={() => setCreatingOpportunity(false)} onSave={async value => { await saveOpportunity(value); setCreatingOpportunity(false); await load(); flash('Oportunidade criada.'); }} />}
      {selected && <ContactDrawer contact={selected} opportunity={opportunityFor(selected.id)} interactions={interactions.filter(i => i.contactId === selected.id)} onClose={() => setSelected(null)} onEdit={() => { setEditing(selected); setSelected(null); }} onDelete={() => void confirmDelete(selected)} />}
      {notice && <div className="dashboard-toast">✓ {notice}</div>}
    </div>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) { return <article className={`stat stat--${tone}`}><span>{label}</span><strong>{value}</strong></article>; }

function ContactRow({ contact, opportunity, onSelect, onStatus }: { contact: Contact; opportunity?: Opportunity; onSelect: () => void; onStatus: (status: ContactStatus) => void }) {
  return <article className="contact-row" onClick={onSelect}><div className="contact-identity"><span className="avatar">{contact.name.charAt(0).toUpperCase()}</span><div><strong title={contact.name}>{compactName(contact.name)}</strong><small>{[contact.jobTitle, contact.company].filter(Boolean).join(' · ') || 'Sem cargo informado'}</small></div></div><div className="context-cell"><strong>{opportunity?.title ?? 'Sem oportunidade'}</strong><small>{contact.reason || 'Contexto não informado'}</small></div><StatusBadge status={contact.status} /><div className={isDue(contact.nextFollowUpAt) ? 'due' : ''}><small>{contact.nextFollowUpAt ? 'Follow-up' : 'Atualizado'}</small><strong>{formatDate(contact.nextFollowUpAt || contact.updatedAt)}</strong></div><select aria-label="Atualizar status" value={contact.status} onClick={e => e.stopPropagation()} onChange={e => onStatus(e.target.value as ContactStatus)}>{CONTACT_STATUSES.map(item => <option value={item} key={item}>{STATUS_LABELS[item]}</option>)}</select></article>;
}


function KanbanBoard({ contacts, opportunityFor, onMove, onSelect }: {
  contacts: Contact[];
  opportunityFor: (contactId: string) => Opportunity | undefined;
  onMove: (contact: Contact, status: ContactStatus) => void;
  onSelect: (contact: Contact) => void;
}) {
  return <section className="kanban" aria-label="Funil de contatos">
    {CONTACT_STATUSES.map(columnStatus => {
      const cards = contacts.filter(contact => contact.status === columnStatus);
      return <div
        className={`kanban-column kanban-column--${columnStatus}`}
        key={columnStatus}
        onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
        onDrop={event => {
          event.preventDefault();
          const id = event.dataTransfer.getData('text/memory-contact-id');
          const contact = contacts.find(item => item.id === id);
          if (contact && contact.status !== columnStatus) onMove(contact, columnStatus);
        }}
      >
        <header><span>{STATUS_LABELS[columnStatus]}</span><small>{cards.length}</small></header>
        <div className="kanban-column__cards">
          {cards.map(contact => {
            const opportunity = opportunityFor(contact.id);
            return <article
              className="kanban-card"
              draggable
              key={contact.id}
              onDragStart={event => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/memory-contact-id', contact.id);
              }}
              onClick={() => onSelect(contact)}
            >
              <div className="kanban-card__person"><span className="avatar">{contact.name.charAt(0).toUpperCase()}</span><div><strong title={contact.name}>{compactName(contact.name)}</strong><small>{contact.company || contact.jobTitle || 'Sem empresa'}</small></div></div>
              {opportunity && <span className="kanban-card__opportunity">◇ {opportunity.title}</span>}
              <p>{contact.reason || 'Contexto ainda não informado.'}</p>
              <footer><span>{contact.nextFollowUpAt ? `Follow-up ${formatDate(contact.nextFollowUpAt)}` : `Atualizado ${formatDate(contact.updatedAt)}`}</span><b>⋮⋮</b></footer>
            </article>;
          })}
          {!cards.length && <div className="kanban-dropzone">Arraste um contato para cá</div>}
        </div>
      </div>;
    })}
  </section>;
}
function StatusPill({ value }: { value: string }) { return <span className="status-badge">{value === 'active' ? 'Ativa' : value}</span>; }

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={e => e.stopPropagation()}><header><div><span className="eyebrow">LINKFLOW</span><h2>{title}</h2></div><button onClick={onClose}>×</button></header>{children}</section></div>; }

function OpportunityModal({ onClose, onSave }: { onClose: () => void; onSave: (value: { title: string; company: string; url: string; description: string }) => Promise<void> }) {
  const [value, setValue] = useState({ title: '', company: '', url: '', description: '' });
  return <Modal title="Nova oportunidade" onClose={onClose}><form onSubmit={e => { e.preventDefault(); void onSave(value); }}><div className="form-grid"><label className="span-2">Título<input autoFocus required value={value.title} onChange={e => setValue(v => ({ ...v, title: e.target.value }))} placeholder="Backend Developer PHP/Laravel" /></label><label className="span-2">Empresa<input required value={value.company} onChange={e => setValue(v => ({ ...v, company: e.target.value }))} /></label><label className="span-2">Link da vaga<input type="url" value={value.url} onChange={e => setValue(v => ({ ...v, url: e.target.value }))} /></label><label className="span-2">Descrição<textarea rows={4} value={value.description} onChange={e => setValue(v => ({ ...v, description: e.target.value }))} /></label></div><div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Criar oportunidade</Button></div></form></Modal>;
}

function ContactDrawer({ contact, opportunity, interactions, onClose, onEdit, onDelete }: { contact: Contact; opportunity?: Opportunity; interactions: Interaction[]; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer" onMouseDown={e => e.stopPropagation()}><header><button onClick={onClose}>×</button></header><div className="drawer-profile"><span className="avatar avatar--large">{contact.name.charAt(0).toUpperCase()}</span><h2>{contact.name}</h2><p>{[contact.jobTitle, contact.company].filter(Boolean).join(' · ')}</p><StatusBadge status={contact.status} /></div><section className="memory-card"><span>POR QUE ADICIONEI?</span><p>{contact.reason || 'Nenhum contexto registrado.'}</p></section>{opportunity && <section className="drawer-section"><span>OPORTUNIDADE</span><strong>{opportunity.title}</strong><small>{opportunity.company}</small></section>}<section className="drawer-section"><span>OBSERVAÇÕES</span><p>{contact.notes || 'Nenhuma observação.'}</p></section><section className="drawer-section"><span>HISTÓRICO</span>{interactions.length ? interactions.slice(0, 6).map(item => <div className="timeline-item" key={item.id}><i /><div><strong>{item.notes}</strong><small>{formatDate(item.createdAt)}</small></div></div>) : <p>Nenhuma interação registrada.</p>}</section><div className="drawer-actions"><a className="button button--primary" href={contact.linkedinUrl} target="_blank" rel="noreferrer">Abrir LinkedIn ↗</a><Button variant="secondary" onClick={onEdit}>Editar</Button><Button variant="danger" onClick={onDelete}>Remover</Button></div></aside></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Dashboard /></StrictMode>);
