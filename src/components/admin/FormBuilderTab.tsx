'use client';
import { useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import type { FormConfig, SessionField, SessionFieldType } from '@/types/motion';
import { uploadJsonOnChain } from '@/lib/walrus-onchain';
import { saveAdminConfig } from '@/lib/fields';
import { dAppKit } from '@/app/dapp-kit';

function uid() { return Math.random().toString(36).slice(2, 9); }

const FIELD_TYPE_COLORS: Record<string, string> = {
  text:'#60a5fa', email:'#34d399', url:'#22d3ee', textarea:'#818cf8',
  checkbox:'#fbbf24', select:'#a78bfa', file:'#f97316',
};

const FIELD_TYPES: { value: SessionFieldType; label: string }[] = [
  { value:'text',     label:'Short Text' },
  { value:'textarea', label:'Long Text'  },
  { value:'email',    label:'Email'      },
  { value:'url',      label:'URL / Link' },
  { value:'select',   label:'Dropdown'   },
  { value:'checkbox', label:'Checkbox'   },
  { value:'file',     label:'File Upload'},
];

// ── Inline field editor ──────────────────────────────────────────────
function FieldEditor({ field, onChange, onRemove, sessionCount, onSessionCountChange }: {
  field: SessionField;
  onChange: (patch: Partial<SessionField>) => void;
  onRemove?: () => void;
  sessionCount?: number;
  onSessionCountChange?: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      borderRadius:'10px',
      background: field.enabled ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.02)',
      border:`1px solid ${field.enabled ? 'rgba(124,58,237,0.22)' : 'var(--border)'}`,
      transition:'all 0.15s', overflow:'hidden',
    }}>
      {/* Row header */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', flexWrap: field.id === 'session_select' ? 'wrap' : 'nowrap' }}>
        <span style={{ fontSize:'11px', fontWeight:600, padding:'2px 7px', borderRadius:'4px', background:`${FIELD_TYPE_COLORS[field.type]}15`, color:FIELD_TYPE_COLORS[field.type], flexShrink:0 }}>{field.type}</span>

        {/* Editable label */}
        <input
          className="input"
          value={field.label}
          onChange={e => onChange({ label: e.target.value })}
          onClick={e => e.stopPropagation()}
          style={{ flex:1, fontSize:'13px', padding:'4px 8px', height:'30px', background:'rgba(255,255,255,0.04)', minWidth: '120px' }}
        />

        {/* INLINE Session Count — always visible for session_select */}
        {/* REPLACED: Moved to expanded options below to satisfy user request "biarkan admin mengcustom di dalamnya" */}

        {/* Expand for more options */}
        <button
          title="More options"
          onClick={() => setOpen(o => !o)}
          style={{ fontSize:'12px', background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:'0 4px', flexShrink:0, lineHeight:1 }}
        >{open ? '▲' : '⚙'}</button>

        {/* Required toggle */}
        {field.enabled && (
          <button onClick={() => onChange({ required: !field.required })}
            style={{ fontSize:'11px', fontWeight:600, padding:'2px 9px', borderRadius:'999px', border:'none', cursor:'pointer', flexShrink:0,
              background: field.required ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.07)',
              color: field.required ? '#f87171' : 'var(--text-3)' }}>
            {field.required ? 'Required' : 'Optional'}
          </button>
        )}

        {/* Remove ANY field */}
        {onRemove && (
          <button onClick={onRemove} title="Remove" style={{ fontSize:'14px', background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:'0 2px', lineHeight:1, flexShrink:0 }}>✕</button>
        )}

        {/* Enabled toggle */}
        <input type="checkbox" className="toggle" checked={field.enabled} onChange={() => onChange({ enabled: !field.enabled })} />
      </div>

      {/* Expanded options */}
      {open && field.enabled && (
        <div style={{ padding:'10px 14px 14px', borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', flexDirection:'column', gap:'8px' }}>

          {/* Session Count Helper (Specific for session_select) */}
          {field.id === 'session_select' && onSessionCountChange && (
            <div style={{ display:'flex', flexDirection:'column', gap:'6px', background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.2)', borderRadius:'8px', padding:'10px' }}>
              <label className="input-label" style={{fontSize:'11px', color:'var(--accent-2)'}}>Quick Set: Number of Sessions</label>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <button onClick={() => onSessionCountChange(Math.max(1, (sessionCount ?? 1) - 1))}
                  className="btn btn-ghost btn-sm" style={{ border:'1px solid rgba(124,58,237,0.3)', color:'var(--accent-2)' }}>−</button>
                <input type="number" min={1} max={50} value={sessionCount ?? 1}
                  onChange={e => onSessionCountChange(Math.max(1, Math.min(50, +e.target.value)))}
                  style={{ width:'60px', textAlign:'center', padding:'4px', fontSize:'14px', fontWeight:700, borderRadius:'6px', border:'1px solid rgba(124,58,237,0.3)', background:'rgba(0,0,0,0.3)', color:'var(--accent-2)' }} />
                <button onClick={() => onSessionCountChange(Math.min(50, (sessionCount ?? 1) + 1))}
                  className="btn btn-ghost btn-sm" style={{ border:'1px solid rgba(124,58,237,0.3)', color:'var(--accent-2)' }}>+</button>
                <span style={{ fontSize:'12px', color:'var(--text-3)' }}>Auto-generates "Session 1", "Session 2", etc.</span>
              </div>
            </div>
          )}

          {/* Field type */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            <div>
              <label className="input-label" style={{fontSize:'11px'}}>Field Type</label>
              <select className="select" value={field.type}
                onChange={e => onChange({ type: e.target.value as SessionFieldType, options: e.target.value === 'select' ? (field.options ?? ['Option 1']) : undefined })}
                style={{ background:'var(--card)', color:'var(--text-1)', padding:'5px 8px', height:'32px', fontSize:'12px' }}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label" style={{fontSize:'11px'}}>Placeholder</label>
              <input className="input" value={field.placeholder ?? ''} placeholder="Hint text"
                onChange={e => onChange({ placeholder: e.target.value })}
                style={{ padding:'5px 8px', height:'32px', fontSize:'12px' }} />
            </div>
          </div>

          <div>
            <label className="input-label" style={{fontSize:'11px'}}>Help Text</label>
            <input className="input" value={field.helpText ?? ''} placeholder="Shown below the field"
              onChange={e => onChange({ helpText: e.target.value })}
              style={{ fontSize:'12px', padding:'5px 8px', height:'32px' }} />
          </div>

          {/* Link fields */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            <div>
              <label className="input-label" style={{fontSize:'11px'}}>Link URL</label>
              <input className="input" value={field.linkUrl ?? ''} placeholder="https://..."
                onChange={e => onChange({ linkUrl: e.target.value })}
                style={{ fontSize:'12px', padding:'5px 8px', height:'32px' }} />
            </div>
            <div>
              <label className="input-label" style={{fontSize:'11px'}}>Link Label</label>
              <input className="input" value={field.linkText ?? ''} placeholder="e.g. View Rules"
                onChange={e => onChange({ linkText: e.target.value })}
                style={{ fontSize:'12px', padding:'5px 8px', height:'32px' }} />
            </div>
          </div>

          {/* Select options */}
          {(field.type === 'select' || field.id === 'session_select') && (
            <div>
              <label className="input-label" style={{fontSize:'11px'}}>Options (comma-separated)</label>
              <input className="input"
                value={field.options?.join(', ') ?? ''}
                placeholder="Option A, Option B, Option C"
                onChange={e => onChange({ options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })}
                style={{ fontSize:'12px', padding:'5px 8px', height:'32px' }} />
            </div>
          )}

          {/* Session count inline — only for session_select field */}
          {field.id === 'session_select' && onSessionCountChange && (
            <div style={{ padding:'10px 12px', borderRadius:'8px', background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.2)', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
              <span style={{ fontSize:'12px', color:'var(--accent-2)', fontWeight:600 }}>Session Count</span>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', flex:1 }}>
                <input type="number" className="input" min={1} max={50} value={sessionCount ?? 1}
                  onChange={e => onSessionCountChange(Math.max(1, +e.target.value))}
                  style={{ width:'80px', padding:'4px 8px', height:'30px', fontSize:'13px' }} />
                <span style={{ fontSize:'12px', color:'var(--text-3)' }}>→ generates "Session 1" to "Session {sessionCount}"</span>
              </div>
              <p style={{ fontSize:'11px', color:'var(--text-3)', width:'100%', marginTop:'2px' }}>
                Overrides manual options above. The dropdown will auto-populate with this many sessions on publish.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Custom field creator ─────────────────────────────────────────────
interface NewFieldDraft {
  label: string; type: SessionFieldType; required: boolean; helpText: string; placeholder: string; options: string;
}
const EMPTY_DRAFT: NewFieldDraft = { label:'', type:'text', required:false, helpText:'', placeholder:'', options:'' };

function CustomFieldCreator({ onAdd }: { onAdd: (f: SessionField) => void }) {
  const [open, setOpen]   = useState(false);
  const [draft, setDraft] = useState<NewFieldDraft>(EMPTY_DRAFT);
  const [err, setErr]     = useState('');

  function handleAdd() {
    if (!draft.label.trim()) { setErr('Label is required.'); return; }
    const field: SessionField = {
      id: 'custom_' + uid(),
      label: draft.label.trim(), type: draft.type, required: draft.required, enabled: true,
      helpText: draft.helpText.trim() || undefined,
      placeholder: draft.placeholder.trim() || undefined,
      options: draft.type === 'select' ? draft.options.split(',').map(o => o.trim()).filter(Boolean) : undefined,
    };
    onAdd(field);
    setDraft(EMPTY_DRAFT); setErr(''); setOpen(false);
  }

  return (
    <div style={{ marginTop:'10px' }}>
      {!open ? (
        <button className="btn btn-secondary btn-sm" style={{ width:'100%' }} onClick={() => setOpen(true)}>
          + Add Custom Field
        </button>
      ) : (
        <div style={{ padding:'14px', borderRadius:'10px', border:'1px solid rgba(124,58,237,0.35)', background:'rgba(124,58,237,0.06)', display:'flex', flexDirection:'column', gap:'8px' }}>
          <p style={{ fontSize:'12px', fontWeight:600, color:'var(--accent-2)' }}>New Custom Field</p>
          <div>
            <label className="input-label" style={{fontSize:'11px'}}>Label <span style={{color:'#f87171'}}>*</span></label>
            <input className="input" placeholder="e.g. LinkedIn Profile" value={draft.label}
              onChange={e => { setDraft(d=>({...d,label:e.target.value})); setErr(''); }} />
            {err && <p style={{ fontSize:'11px', color:'#f87171', marginTop:'3px' }}>{err}</p>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            <div>
              <label className="input-label" style={{fontSize:'11px'}}>Type</label>
              <select className="select" value={draft.type} onChange={e => setDraft(d=>({...d,type:e.target.value as SessionFieldType}))}
                style={{ background:'var(--card)', color:'var(--text-1)' }}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end', paddingBottom:'2px' }}>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--text-2)' }}>
                <input type="checkbox" className="toggle" checked={draft.required} onChange={e => setDraft(d=>({...d,required:e.target.checked}))} />
                Required
              </label>
            </div>
          </div>
          <input className="input" placeholder="Placeholder text (optional)" value={draft.placeholder}
            onChange={e => setDraft(d=>({...d,placeholder:e.target.value}))} />
          <input className="input" placeholder="Help text (optional)" value={draft.helpText}
            onChange={e => setDraft(d=>({...d,helpText:e.target.value}))} />
          {draft.type === 'select' && (
            <input className="input" placeholder="Options: A, B, C (comma-separated)" value={draft.options}
              onChange={e => setDraft(d=>({...d,options:e.target.value}))} />
          )}
          <div style={{ display:'flex', gap:'8px' }}>
            <button className="btn btn-primary btn-sm" style={{ flex:1 }} onClick={handleAdd}>Add Field</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setDraft(EMPTY_DRAFT); setErr(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────
export function FormBuilderTab({ config, onChange }: {
  config: FormConfig;
  onChange: (c: FormConfig) => void;
}) {
  const account = useCurrentAccount();
  const [publishing, setPublishing] = useState(false);
  const [pubUrl, setPubUrl]         = useState(config.publishedBlobId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/?form=${config.publishedBlobId}` : '');
  const [pubBlobId, setPubBlobId]   = useState(config.publishedBlobId ?? '');
  const [copied, setCopied]         = useState(false);
  const [copiedBlobId, setCopiedBlobId] = useState(false);

  function updateField(id: string, patch: Partial<SessionField>) {
    onChange({ ...config, fields: config.fields.map(f => f.id === id ? { ...f, ...patch } : f) });
  }
  function removeField(id: string) {
    onChange({ ...config, fields: config.fields.filter(f => f.id !== id) });
  }
  function addCustomField(f: SessionField) {
    onChange({ ...config, fields: [...config.fields, f] });
  }

  async function publish() {
    const connection = dAppKit.stores.$connection.get();
    if (!connection.isConnected || !connection.account) {
      alert('Please connect your wallet first.');
      return;
    }
    const ownerAddress = connection.account.address;

    setPublishing(true);
    try {
      // Deep-clone fields to avoid mutating shared React state references
      const clonedFields = config.fields.map(f => ({ ...f, options: f.options ? [...f.options] : undefined }));
      const cfg = { ...config, id: uid(), createdAt: Date.now(), publishedBy: ownerAddress, fields: clonedFields };

      // Sync session dropdown options from sessionCount (MUST happen on the deep clone)
      const sessionField = cfg.fields.find(f => f.id === 'session_select');
      if (sessionField && cfg.sessionCount > 0) {
        sessionField.options = Array.from({ length: cfg.sessionCount }, (_, i) => `Session ${i + 1}`);
        sessionField.enabled = true;
      }

      // On-chain upload (2 wallet popups):
      // Popup 1: register form blob + pay WAL storage cost
      // Popup 2: certify the blob is durably stored
      const { blobId } = await uploadJsonOnChain(cfg, ownerAddress);
      cfg.publishedBlobId = blobId;
      onChange(cfg);
      saveAdminConfig(cfg);
      const formUrl = `${window.location.origin}/?form=${blobId}`;
      setPubUrl(formUrl);
      setPubBlobId(blobId);
    } catch (e) { alert('Publish failed: ' + (e as Error).message); }
    setPublishing(false);
  }


  function copy() { navigator.clipboard.writeText(pubUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>

      {/* 1. Meta */}
      <div className="card" style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'12px' }}>
        <p style={{ fontSize:'11px', fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:'4px' }}>
          1. Form Meta
        </p>
        <div>
          <label className="input-label">Title</label>
          <input className="input" value={config.title} onChange={e => onChange({ ...config, title: e.target.value })} />
        </div>
        <div>
          <label className="input-label">Description</label>
          <textarea className="textarea" rows={2} value={config.description}
            onChange={e => onChange({ ...config, description: e.target.value })}
            style={{ minHeight:'unset', resize:'none' }} />
        </div>
      </div>

      {/* 2. Fields */}
      <div className="card" style={{ padding:'20px' }}>
        <p style={{ fontSize:'11px', fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:'6px' }}>
          2. Form Fields
        </p>
        <p style={{ fontSize:'12px', color:'var(--text-3)', marginBottom:'14px' }}>
          Edit labels inline. Click <strong style={{color:'var(--text-2)'}}>⚙</strong> to expand field options (type, placeholder, help text, link, session count).
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          {config.fields.map(f => (
            <FieldEditor
              key={f.id}
              field={f}
              onChange={patch => updateField(f.id, patch)}
              onRemove={() => removeField(f.id)}
              sessionCount={f.id === 'session_select' ? config.sessionCount : undefined}
              onSessionCountChange={f.id === 'session_select' ? (n) => {
                const fields = config.fields.map(field => {
                  if (field.id === 'session_select') {
                    return { ...field, options: Array.from({ length: n }, (_, i) => `Session ${i + 1}`) };
                  }
                  return field;
                });
                onChange({ ...config, sessionCount: n, fields });
              } : undefined}
            />
          ))}
        </div>
        <CustomFieldCreator onAdd={addCustomField} />
      </div>

      {/* 3. Publish */}
      <div className="card" style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'12px' }}>
        <p style={{ fontSize:'11px', fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-3)' }}>
          3. Publish Form
        </p>

        {/* Live session preview */}
        {config.sessionCount > 0 && (
          <div style={{ padding:'8px 12px', borderRadius:'8px', background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.2)', fontSize:'12px', color:'var(--text-2)' }}>
            📋 Session dropdown will contain <strong style={{color:'var(--accent-2)'}}>{config.sessionCount}</strong> options:
            {' '}<em style={{color:'var(--text-3)'}}>
              Session 1{config.sessionCount > 1 ? ` → Session ${config.sessionCount}` : ''}
            </em>
          </div>
        )}

        <p style={{ fontSize:'13px', color:'var(--text-2)' }}>
          Uploads the form config to Walrus and generates a shareable link.
          <strong style={{color:'var(--text-1)'}}> Your wallet will ask for approval first.</strong>
        </p>
        <button className="btn btn-primary btn-lg" onClick={publish} disabled={publishing}>
          {publishing
            ? <><span className="spinner" /> Publishing to Walrus…</>
            : '🚀 Sign & Publish Form'}
        </button>

        {pubUrl && (
          <>
            {/* Form URL */}
            <div style={{ display:'flex', gap:'6px' }}>
              <div style={{ flex:1, background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)', borderRadius:'8px', padding:'10px 12px', fontSize:'12px', fontFamily:'var(--mono)', color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {pubUrl}
              </div>
              <button className="btn btn-secondary" onClick={copy}>{copied ? '✓ Copied' : 'Copy Link'}</button>
            </div>

            {/* Form Blob ID — admin needs this for Submissions tab */}
            <div style={{ padding:'10px 12px', borderRadius:'8px', background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.2)', display:'flex', flexDirection:'column', gap:'6px' }}>
              <p style={{ fontSize:'11px', fontWeight:600, color:'#4ade80', textTransform:'uppercase', letterSpacing:'0.06em' }}>Form Blob ID (for Submissions tab)</p>
              <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                <code style={{ flex:1, fontSize:'11px', fontFamily:'var(--mono)', color:'var(--text-1)', wordBreak:'break-all' }}>
                  {pubBlobId}
                </code>
                <button className="btn btn-ghost btn-sm" style={{ flexShrink:0 }}
                  onClick={() => { navigator.clipboard.writeText(pubBlobId); setCopiedBlobId(true); setTimeout(()=>setCopiedBlobId(false), 2000); }}>
                  {copiedBlobId ? '✓ Copied' : 'Copy ID'}
                </button>
              </div>
              <p style={{ fontSize:'11px', color:'var(--text-3)' }}>Paste this in the Submissions tab to see all submissions for this form.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
