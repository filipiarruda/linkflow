import { useEffect, useState, type FormEvent } from 'react';
import { CONTACT_STATUSES, STATUS_LABELS, type Contact, type ContactStatus, type DetectedProfile, type Opportunity } from '../types';
import { Button } from './Button';

export interface ContactFormValue {
  id?: string;
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
}

const emptyValue: ContactFormValue = {
  name: '', linkedinUrl: '', company: '', jobTitle: '', reason: '', notes: '', status: 'invitation_sent',
};

export function ContactForm({ contact, detected, opportunities, initialOpportunityId = '', compact = false, onSubmit, onCancel }: {
  contact?: Contact;
  detected?: DetectedProfile;
  opportunities: Opportunity[];
  initialOpportunityId?: string;
  compact?: boolean;
  onSubmit: (value: ContactFormValue, opportunityId: string, newOpportunity?: { title: string; company: string }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState<ContactFormValue>(emptyValue);
  const [opportunityId, setOpportunityId] = useState(initialOpportunityId);
  const [newOpportunity, setNewOpportunity] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(contact ? { ...contact } : {
      ...emptyValue,
      linkedinUrl: detected?.url ?? '',
      name: detected?.name ?? '',
      company: detected?.company ?? '',
      jobTitle: detected?.headline ?? '',
    });
    setOpportunityId(initialOpportunityId);
  }, [contact, detected, initialOpportunityId]);

  const update = (key: keyof ContactFormValue, next: string) => setValue(current => ({ ...current, [key]: next }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.name.trim() || !value.linkedinUrl.trim()) return;
    setSaving(true);
    try {
      await onSubmit(value, opportunityId, newOpportunity && newTitle.trim() ? { title: newTitle.trim(), company: value.company } : undefined);
    } finally { setSaving(false); }
  };

  return (
    <form className={`contact-form ${compact ? 'contact-form--compact' : ''}`} onSubmit={submit}>
      <div className="form-grid">
        <label>Nome<input required value={value.name} onChange={e => update('name', e.target.value)} placeholder="Nome do contato" /></label>
        <label>Empresa<input value={value.company} onChange={e => update('company', e.target.value)} placeholder="Empresa" /></label>
        <label className="span-2">Cargo / headline<input value={value.jobTitle} onChange={e => update('jobTitle', e.target.value)} placeholder="Tech Recruiter" /></label>
        <label className="span-2">LinkedIn<input required type="url" value={value.linkedinUrl} onChange={e => update('linkedinUrl', e.target.value)} placeholder="https://www.linkedin.com/in/..." /></label>
        <label>Status<select value={value.status} onChange={e => update('status', e.target.value)}>{CONTACT_STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
        <label>Próximo follow-up<input type="date" value={value.nextFollowUpAt?.slice(0, 10) ?? ''} onChange={e => update('nextFollowUpAt', e.target.value)} /></label>
        <label className="span-2 important-field"><span>Por que adicionei esta pessoa?</span><textarea required value={value.reason} onChange={e => update('reason', e.target.value)} placeholder="Ex.: Vi uma vaga Laravel na empresa e encontrei essa pessoa como Tech Recruiter." rows={compact ? 3 : 4} /></label>
        <label className="span-2">Observações<textarea value={value.notes} onChange={e => update('notes', e.target.value)} placeholder="Informações úteis para a próxima abordagem" rows={3} /></label>
        <label className="span-2">Oportunidade
          <select value={newOpportunity ? '__new' : opportunityId} onChange={e => { setNewOpportunity(e.target.value === '__new'); setOpportunityId(e.target.value === '__new' ? '' : e.target.value); }}>
            <option value="">Nenhuma oportunidade</option>
            {opportunities.map(item => <option key={item.id} value={item.id}>{item.title} · {item.company}</option>)}
            <option value="__new">+ Criar nova oportunidade</option>
          </select>
        </label>
        {newOpportunity && <label className="span-2">Título da nova oportunidade<input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Backend Developer PHP/Laravel" /></label>}
      </div>
      <div className="form-actions">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : contact ? 'Salvar alterações' : 'Salvar contato'}</Button>
      </div>
    </form>
  );
}
