'use client';
import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import type { FormConfig, SessionField, SessionFieldType } from '@/types/walform';
import { uploadJsonOnChain } from '@/lib/walrus-onchain';
import { saveAdminConfig } from '@/lib/fields';
import { dAppKit } from '@/app/dapp-kit';
import { motion } from 'framer-motion';

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
  const [optionsText, setOptionsText] = useState(field.options?.join(', ') ?? '');

  // Keep local text in sync with external options changes ONLY when meaningfully different
  useEffect(() => {
    const extOptions = field.options?.join(', ') ?? '';
    const localOptions = optionsText.split(',').map(o => o.trim()).filter(Boolean).join(', ');
    const extNormalized = field.options?.join(', ') ?? '';
    
    if (field.options && localOptions !== extNormalized) {
      setOptionsText(extOptions);
    }
  }, [field.options]);

  return (
    <div style={{
      borderRadius:'16px',
      background: field.enabled ? 'rgba(139, 92, 246, 0.03)' : 'rgba(255,255,255,0.01)',
      border:`1px solid ${field.enabled ? 'var(--accent-soft)' : 'var(--border)'}`,
      transition:'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      overflow:'hidden',
      boxShadow: field.enabled ? '0 4px 20px -10px rgba(139, 92, 246, 0.1)' : 'none',
      marginBottom: '12px'
    }}>
      {/* Row header */}
      <div style={{ display:'flex', alignItems:'center', gap:'16px', padding:'16px 20px', position: 'relative' }}>
        <div style={{ 
          width: 32, height: 32, borderRadius: 8, 
          background: `${FIELD_TYPE_COLORS[field.type]}15`, 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          border: `1px solid ${FIELD_TYPE_COLORS[field.type]}30`,
          flexShrink: 0 
        }}>
          <span style={{ fontSize:'10px', fontWeight:800, color:FIELD_TYPE_COLORS[field.type], textTransform: 'uppercase' }}>{field.type[0]}</span>
        </div>

        {/* Editable label */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <input
            className="input-minimal"
            value={field.label}
            placeholder="Field Label"
            onChange={e => onChange({ label: e.target.value })}
            style={{ 
              fontSize:'15px', fontWeight: 600, color: field.enabled ? 'var(--text-1)' : 'var(--text-3)',
              background: 'transparent', border: 'none', padding: 0, height: 'auto', outline: 'none'
            }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 500, textTransform: 'capitalize' }}>{field.type} Field</span>
        </div>

        {/* Action Group */}
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          {/* Required toggle */}
          {field.enabled && (
            <button 
              onClick={() => onChange({ required: !field.required })}
              style={{ 
                fontSize:'11px', fontWeight:700, padding:'4px 10px', borderRadius:'6px', border:'1px solid var(--border)', cursor:'pointer',
                background: field.required ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.03)',
                color: field.required ? '#f87171' : 'var(--text-3)',
                transition: 'all 0.2s'
              }}
            >
              {field.required ? 'REQUIRED' : 'OPTIONAL'}
            </button>
          )}

          {/* Expand for more options */}
          <button
            onClick={() => setOpen(o => !o)}
            style={{ 
              width: 30, height: 30, borderRadius: '8px', border: '1px solid var(--border)', 
              background: open ? 'rgba(255,255,255,0.08)' : 'transparent', color: 'var(--text-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>

          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

          {/* Enabled toggle */}
          <div style={{ display: 'flex', alignItems: 'center', scale: '0.9' }}>
            <input type="checkbox" className="toggle" checked={field.enabled} onChange={() => onChange({ enabled: !field.enabled })} />
          </div>

          {onRemove && (
            <button 
              onClick={onRemove} 
              style={{ 
                width: 30, height: 30, borderRadius: '8px', border: 'none', background: 'transparent',
                color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                cursor: 'pointer', transition: 'all 0.2s' 
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded options */}
      {open && field.enabled && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          style={{ padding:'0 20px 20px', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:'16px', paddingTop: '20px' }}
        >

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
            <div>
              <label className="input-label">Field Type</label>
              <select className="select" value={field.type}
                onChange={e => onChange({ 
                  type: e.target.value as SessionFieldType, 
                  options: (e.target.value === 'select' || e.target.value === 'checkbox') ? (field.options ?? ['Option 1']) : undefined 
                })}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Placeholder</label>
              <input className="input" value={field.placeholder ?? ''} placeholder="e.g. Enter your name"
                onChange={e => onChange({ placeholder: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="input-label">Help Text</label>
            <input className="input" value={field.helpText ?? ''} placeholder="Helper instructions for the user"
              onChange={e => onChange({ helpText: e.target.value })} />
          </div>

          {/* Select / Checkbox options */}
          {(field.type === 'select' || field.type === 'checkbox') && (
            <div>
              <label className="input-label">Options (comma-separated)</label>
              <textarea
                style={{ width:'100%', padding:'8px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'4px', color:'#fff', minHeight:'60px', fontSize:'13px', outline:'none' }}
                value={optionsText}
                placeholder="Option 1, Option 2, Option 3..."
                onChange={e => {
                  const val = e.target.value;
                  setOptionsText(val);
                  const parsed = val.split(',').map(o => o.trim()).filter(Boolean);
                  // Only notify parent if the actual list of options changed
                  if (JSON.stringify(parsed) !== JSON.stringify(field.options || [])) {
                    onChange({ options: parsed });
                  }
                }}
              />
              <p style={{ fontSize:'11px', color:'var(--text-3)', marginTop:'4px' }}>
                Use commas to separate choices. Spaces between choices are fine!
              </p>
            </div>
          )}
        </motion.div>
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
      options: (draft.type === 'select' || draft.type === 'checkbox') ? draft.options.split(',').map(o => o.trim()).filter(Boolean) : undefined,
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
          {(draft.type === 'select' || draft.type === 'checkbox') && (
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
      // Deep-clone fields and ensure options are preserved
      // Detailed logging for verification
      console.log("🚀 PUBLISHING FORM...");
      console.log("📦 Base Config:", config);
      
      const clonedFields = config.fields.map(f => {
        let options = f.options;
        
        // Safety check for session_select if it's supposed to be a list but has none
        if (f.id === 'session_select' && f.type === 'checkbox' && (!options || options.length === 0)) {
          console.warn("⚠️ session_select has no options! Adding default fallback.");
          options = ['Session 1', 'Session 2'];
        }

        return {
          ...f,
          options: options ? [...options] : undefined
        };
      });

      console.log("📦 Cloned Fields with Options:", clonedFields.filter(f => f.options).map(f => ({ id:f.id, opts:f.options })));

      const cfg: FormConfig = { 
        ...config, 
        id: uid(), 
        createdAt: Date.now(), 
        publishedBy: ownerAddress, 
        fields: clonedFields,
        publishedBlobId: undefined 
      };

      console.log("📤 Final JSON payload:", cfg);
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
                onChange({ ...config, sessionCount: n });
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
          <div style={{ marginTop:'12px', display:'flex', flexDirection:'column', gap:'12px' }}>
            <div style={{ padding:'12px', borderRadius:'12px', background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.2)', display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ fontSize:'20px' }}>✅</span>
              <div>
                <p style={{ fontSize:'14px', fontWeight:600, color:'#4ade80' }}>Published Successfully!</p>
                <p style={{ fontSize:'12px', color:'var(--text-3)' }}>It may take 30-60 seconds for the decentralized link to update.</p>
              </div>
            </div>

            {/* Form URL */}
            <div style={{ display:'flex', gap:'8px' }}>
              <div style={{ flex:1, background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)', borderRadius:'8px', padding:'10px 12px', fontSize:'12px', fontFamily:'var(--mono)', color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {pubUrl}
              </div>
              <button className="btn btn-secondary" onClick={copy}>{copied ? '✓' : 'Copy'}</button>
              <a href={pubUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ padding:'0 12px', display:'flex', alignItems:'center' }}>
                🔗 Open
              </a>
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
          </div>
        )}
      </div>
    </div>
  );
}
