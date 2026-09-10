import { db, makeId, nowIso } from './database';
import type { Contact, ContactStatus, InteractionType, Opportunity } from '../types';
import { normalizeLinkedInUrl } from '../linkedin/urlNormalizer';

const PENDING_CONNECTIONS_KEY = 'memoryPendingConnections';

interface PendingConnection {
  url: string;
  name: string;
  headline?: string;
  company?: string;
  capturedAt?: string;
}

export type ContactInput = Omit<Contact, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export async function saveContact(input: ContactInput, opportunityId?: string): Promise<Contact> {
  const timestamp = nowIso();
  const previous = input.id ? await db.contacts.get(input.id) : undefined;
  const contact: Contact = {
    ...input,
    id: input.id ?? makeId(),
    linkedinUrl: normalizeLinkedInUrl(input.linkedinUrl),
    createdAt: previous?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  await db.transaction('rw', db.contacts, db.contactOpportunities, db.interactions, async () => {
    await db.contacts.put(contact);
    if (opportunityId !== undefined) {
      await db.contactOpportunities.where('contactId').equals(contact.id).delete();
    }
    if (opportunityId) {
      const exists = await db.contactOpportunities
        .where('[contactId+opportunityId]')
        .equals([contact.id, opportunityId])
        .first();
      if (!exists) await db.contactOpportunities.add({ id: makeId(), contactId: contact.id, opportunityId });
    }
    if (!previous && contact.status === 'invitation_sent') {
      await db.interactions.add({ id: makeId(), contactId: contact.id, type: 'invitation_sent', notes: 'Contato registrado com convite enviado.', createdAt: timestamp });
    } else if (previous && previous.status !== contact.status) {
      await db.interactions.add({ id: makeId(), contactId: contact.id, type: 'status_change', notes: `${previous.status} → ${contact.status}`, createdAt: timestamp });
    }
  });
  return contact;
}

export async function setContactStatus(contact: Contact, status: ContactStatus): Promise<Contact> {
  const timestamp = nowIso();
  const dates: Partial<Contact> = {};
  if (status === 'connected' && !contact.connectedAt) dates.connectedAt = timestamp;
  if (['message_sent', 'replied', 'conversation'].includes(status)) dates.lastContactAt = timestamp;
  return saveContact({ ...contact, ...dates, status });
}

export async function findContactByUrl(url: string) {
  return db.contacts.where('linkedinUrl').equals(normalizeLinkedInUrl(url)).first();
}


export async function syncPendingConnections(): Promise<number> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return 0;
  const stored = await chrome.storage.local.get(PENDING_CONNECTIONS_KEY);
  const pending = Array.isArray(stored[PENDING_CONNECTIONS_KEY])
    ? stored[PENDING_CONNECTIONS_KEY] as PendingConnection[]
    : [];
  if (!pending.length) return 0;

  const processed = new Set<string>();
  for (const captured of pending) {
    const linkedinUrl = normalizeLinkedInUrl(captured.url || '');
    if (!linkedinUrl || !captured.name?.trim()) continue;
    const existing = await findContactByUrl(linkedinUrl);
    if (!existing) {
      await saveContact({
        name: captured.name.trim(),
        linkedinUrl,
        company: captured.company?.trim() ?? '',
        jobTitle: captured.headline?.trim() ?? '',
        reason: 'Contato capturado ao enviar um convite de conexão no LinkedIn.',
        notes: 'Adicionado automaticamente pela extensão. Complete o contexto quando puder.',
        status: 'invitation_sent',
        invitationSentAt: captured.capturedAt ?? nowIso(),
      });
    } else if (existing.status === 'discovered') {
      await saveContact({
        ...existing,
        status: 'invitation_sent',
        invitationSentAt: existing.invitationSentAt ?? captured.capturedAt ?? nowIso(),
      });
    }
    processed.add(linkedinUrl);
  }

  const latest = await chrome.storage.local.get(PENDING_CONNECTIONS_KEY);
  const latestQueue = Array.isArray(latest[PENDING_CONNECTIONS_KEY])
    ? latest[PENDING_CONNECTIONS_KEY] as PendingConnection[]
    : [];
  await chrome.storage.local.set({
    [PENDING_CONNECTIONS_KEY]: latestQueue.filter(item => !processed.has(normalizeLinkedInUrl(item.url || ''))),
  });
  return processed.size;
}
export async function saveOpportunity(input: Partial<Opportunity> & Pick<Opportunity, 'title' | 'company'>): Promise<Opportunity> {
  const timestamp = nowIso();
  const previous = input.id ? await db.opportunities.get(input.id) : undefined;
  const opportunity: Opportunity = {
    id: input.id ?? makeId(),
    title: input.title.trim(),
    company: input.company.trim(),
    url: input.url?.trim() ?? '',
    description: input.description?.trim() ?? '',
    status: input.status ?? 'active',
    createdAt: previous?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  await db.opportunities.put(opportunity);
  return opportunity;
}

export async function addInteraction(contactId: string, type: InteractionType, notes: string) {
  const createdAt = nowIso();
  await db.transaction('rw', db.interactions, db.contacts, async () => {
    await db.interactions.add({ id: makeId(), contactId, type, notes: notes.trim(), createdAt });
    if (['message_sent', 'reply_received', 'follow_up'].includes(type)) {
      await db.contacts.update(contactId, { lastContactAt: createdAt, updatedAt: createdAt });
    }
  });
}

export async function removeContact(id: string) {
  await db.transaction('rw', db.contacts, db.contactOpportunities, db.contactTags, db.interactions, async () => {
    await Promise.all([
      db.contacts.delete(id),
      db.contactOpportunities.where('contactId').equals(id).delete(),
      db.contactTags.where('contactId').equals(id).delete(),
      db.interactions.where('contactId').equals(id).delete(),
    ]);
  });
}
