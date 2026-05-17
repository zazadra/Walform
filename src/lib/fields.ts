import type { SessionField, FormConfig } from '@/types/walform';

// ── Admin addresses ────────────────────────────────────────────────
// No hardcoded platform admins. Each form's creator is the sole admin
// of their own form. Co-admins can be added per-form in the Form Builder.
export const INITIAL_ADMINS: string[] = [];

export function getAdmins(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('walform:admins') ?? '[]') as string[];
  } catch { return []; }
}

export function isAdmin(address?: string): boolean {
  if (!address) return false;
  return getAdmins().some(a => a.toLowerCase() === address.toLowerCase());
}

export function addAdmin(address: string) {
  if (typeof window === 'undefined') return;
  const current = getAdmins();
  if (!current.map(a => a.toLowerCase()).includes(address.toLowerCase())) {
    localStorage.setItem('walform:admins', JSON.stringify([...current, address]));
  }
}

export function removeAdmin(address: string) {
  if (typeof window === 'undefined') return;
  const current = getAdmins().filter(a => a.toLowerCase() !== address.toLowerCase());
  localStorage.setItem('walform:admins', JSON.stringify(current));
}

// ── Submission index ──────────────────────────────────────────────
export function getSubIds(formId: string): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(`walform:subs:${formId}`) ?? '[]'); }
  catch { return []; }
}

export function addSubId(formId: string, blobId: string) {
  if (typeof window === 'undefined') return;
  const ids = getSubIds(formId);
  if (!ids.includes(blobId)) {
    const next = [...ids, blobId];
    localStorage.setItem(`walform:subs:${formId}`, JSON.stringify(next));
    const all = getAllSubIds();
    if (!all.includes(blobId)) {
      localStorage.setItem('walform:subs:ALL', JSON.stringify([...all, blobId]));
    }
  }
}

export function getAllSubIds(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('walform:subs:ALL') ?? '[]'); }
  catch { return []; }
}

// ── Merge external sub IDs ────────────────────────────────────────
export function mergeSubIds(formId: string, incoming: string[]) {
  if (typeof window === 'undefined') return [];
  const existing = new Set(getSubIds(formId));
  incoming.forEach(id => existing.add(id));
  const merged = [...existing];
  localStorage.setItem(`walform:subs:${formId}`, JSON.stringify(merged));
  return merged;
}

// ── Form config storage ───────────────────────────────────────────
export function saveAdminConfig(config: FormConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('walform:admin:config', JSON.stringify(config));
}
export function loadAdminConfig(): FormConfig | null {
  if (typeof window === 'undefined') return null;
  try { const s = localStorage.getItem('walform:admin:config'); return s ? JSON.parse(s) : null; }
  catch { return null; }
}

// ── Default Walrus Sessions fields ────────────────────────────────
export const DEFAULT_FIELDS: SessionField[] = [
  { id:'project_name',      label:'Project Name',                                          type:'text',     required:true,  enabled:true,  placeholder:'Your project name' },
  { id:'session_select',    label:'Session Selection',                                     type:'checkbox', required:true,  enabled:true  },
  { id:'leader_name',       label:'Team Leader Name',                                      type:'text',     required:true,  enabled:true,  placeholder:'Full name' },
  { id:'leader_email',      label:'Team Leader Email',                                     type:'email',    required:true,  enabled:true,  placeholder:'email@example.com' },
  { id:'leader_telegram',   label:'Team Leader Telegram Handle',                           type:'text',     required:false, enabled:true,  placeholder:'@username' },
  { id:'discord_handle',    label:'Discord Handle',                                        type:'text',     required:true,  enabled:true,  placeholder:'username', helpText:'Make sure to join our discord — it is required and how we contact you.', linkText:'Join Discord', linkUrl:'https://discord.gg/walrusprotocol' },
  { id:'deepsurge_link',    label:'DeepSurge Project Link',                                type:'url',      required:true,  enabled:true,  placeholder:'https://', helpText:'Needs to be on mainnet' },
  { id:'website_link',      label:'Form / Website Link',                                   type:'url',      required:true,  enabled:true,  placeholder:'https://' },
  { id:'workflow_desc',     label:'Describe the workflow and functionalities of your form',type:'textarea', required:true,  enabled:true,  placeholder:'Admin flow: create a form, update form, review replies\nUser flow: Submit a form' },
  { id:'visuals',           label:'Share any visuals of your form',                        type:'file',     required:true,  enabled:true,  helpText:'Screenshots or images' },
  { id:'demo_video',        label:'Demo video of the form (sub 3 minutes)',                type:'url',      required:true,  enabled:true,  placeholder:'https://youtube.com/... or https://loom.com/...' },
  { id:'differentiator',    label:'Which features set your solution apart from the rest?', type:'textarea', required:true,  enabled:true,  placeholder:'Describe your unique features...' },
  { id:'walrus_feedback',   label:'Feedback (about building on Walrus)',                   type:'textarea', required:true,  enabled:true,  placeholder:'What worked well, challenges encountered, missing features, issues with access, suggestions for improving the developer experience...' },
  { id:'x_account',         label:'X Account',                                             type:'text',     required:false, enabled:true,  placeholder:'@username' },
  { id:'x_tweet_link',      label:'Share link to X tweet',                                 type:'url',      required:true,  enabled:true,  placeholder:'https://x.com/...' },
  { id:'sui_address',       label:'SUI Address',                                           type:'text',     required:true,  enabled:true,  placeholder:'0x...' },
  { id:'github',            label:'GitHub',                                                type:'url',      required:true,  enabled:true,  placeholder:'https://github.com/...', helpText:'Link to your GitHub profile and relevant repositories.' },
  { id:'session_feedback',  label:'Session Feedback',                                      type:'textarea', required:false, enabled:true,  placeholder:'Optional...', helpText:'Thoughts on the sessions. No impact on rewards.' },
  { id:'deepsurge_feedback',label:'DeepSurge Feedback',                                    type:'textarea', required:false, enabled:true,  placeholder:'Optional...', helpText:'Thoughts on DeepSurge. No impact on rewards.' },
  { id:'rules_confirm',     label:'I confirm I have read, understood, and agree to the rules and regulations of the session.', type:'checkbox', required:true, enabled:true, linkText:'View Rules', linkUrl:'https://thewalrussessions.wal.app/' },
];

export const DEFAULT_CONFIG: FormConfig = {
  id: 'default',
  title: 'Walrus Sessions — Application Form',
  description: 'Submit your project for review by the Walrus Sessions team.',
  fields: DEFAULT_FIELDS,
  sessionCount: 1,
  admins: [], // No hardcoded admins — publisher wallet is set at publish time
  createdAt: 0,
};
