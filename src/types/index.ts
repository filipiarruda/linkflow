export const CONTACT_STATUSES = [
  'discovered',
  'invitation_sent',
  'connected',
  'message_pending',
  'message_sent',
  'replied',
  'conversation',
  'closed',
  'archived',
] as const;

export type ContactStatus = typeof CONTACT_STATUSES[number];
export type OpportunityStatus = 'active' | 'paused' | 'closed' | 'archived';
export type InteractionType =
  | 'invitation_sent'
  | 'connection_accepted'
  | 'message_sent'
  | 'reply_received'
  | 'follow_up'
  | 'note'
  | 'status_change';

export interface Contact {
  id: string;
  name: string;
  linkedinUrl: string;
  company: string;
  jobTitle: string;
  reason: string;
  notes: string;
  status: ContactStatus;
  invitationSentAt?: string;
  connectedAt?: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  title: string;
  company: string;
  url: string;
  description: string;
  status: OpportunityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ContactOpportunity { id: string; contactId: string; opportunityId: string }
export interface Interaction { id: string; contactId: string; type: InteractionType; notes: string; createdAt: string }
export interface Tag { id: string; name: string; createdAt: string }
export interface ContactTag { id: string; contactId: string; tagId: string }

export interface DetectedProfile {
  url: string;
  name: string;
  headline: string;
  company: string;
}

export const STATUS_LABELS: Record<ContactStatus, string> = {
  discovered: 'Encontrado',
  invitation_sent: 'Convite enviado',
  connected: 'Conectado',
  message_pending: 'Mensagem pendente',
  message_sent: 'Mensagem enviada',
  replied: 'Respondeu',
  conversation: 'Conversando',
  closed: 'Encerrado',
  archived: 'Arquivado',
};
