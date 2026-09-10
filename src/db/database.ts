import Dexie, { type EntityTable } from 'dexie';
import type { Contact, ContactOpportunity, ContactTag, Interaction, Opportunity, Tag } from '../types';

export class MemoryDatabase extends Dexie {
  contacts!: EntityTable<Contact, 'id'>;
  opportunities!: EntityTable<Opportunity, 'id'>;
  contactOpportunities!: EntityTable<ContactOpportunity, 'id'>;
  interactions!: EntityTable<Interaction, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  contactTags!: EntityTable<ContactTag, 'id'>;

  constructor() {
    super('MemoryCRM');
    this.version(1).stores({
      contacts: 'id, &linkedinUrl, name, company, status, updatedAt, nextFollowUpAt',
      opportunities: 'id, title, company, status, updatedAt',
      contactOpportunities: 'id, contactId, opportunityId, [contactId+opportunityId]',
      interactions: 'id, contactId, type, createdAt',
      tags: 'id, &name, createdAt',
      contactTags: 'id, contactId, tagId, [contactId+tagId]',
    });
  }
}

export const db = new MemoryDatabase();

export const makeId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
