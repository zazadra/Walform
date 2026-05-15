'use client';
import { useState, useEffect } from 'react';
import type { FormConfig, SessionField, SessionFieldType } from '@/types/walform';
import { uploadJsonOnChain } from '@/lib/walrus-onchain';
import { saveAdminConfig } from '@/lib/fields';
import { motion } from 'framer-motion';
import { cacheFormId } from '@/lib/form-registry';
import { useWalletConnection } from '@/hooks/useWalletConnection';
// Note: Wallet signing is handled internally via CurrentAccountSigner in walrus.ts

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

// -- Inline field editor ----------------------------------------------
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
      <div 
        className="mobile-stack-sm"
        style={{ display:'flex', alignItems:'center', gap:'16px', padding:'16px 20px', position: 'relative' }}
      >
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
        <div className="mobile-w-full" style={{ display:'flex', alignItems:'center', gap:'12px', flexWrap: 'wrap' }}>
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

          <div style={{ display: 'flex', gap: '8px' }}>
            {onRemove && (
              <button 
                onClick={onRemove} 
                style={{ 
                  width: 30, height: 30, borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent',
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
      </div>

      {/* Expanded options */}
      {open && field.enabled && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          style={{ padding:'0 20px 20px', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:'16px', paddingTop: '20px' }}
        >

          <div 
            className="mobile-grid-stack"
            style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}
          >
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


// -- Custom field creator ---------------------------------------------
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
          <div 
            className="mobile-grid-stack"
            style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}
          >
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

// -- Main tab ----------------------------------------------------------
export function FormBuilderTab({ config, onChange, ownerAddress }: {
  config: FormConfig;
  onChange: (c: FormConfig) => void;
  ownerAddress: string;
}) {
  const [publishing, setPublishing] = useState(false);
  const [pubMsg, setPubMsg]         = useState('');
  const [pubUrl, setPubUrl]         = useState(config.publishedSuiObjectId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/f/?formId=${config.publishedSuiObjectId}` : config.publishedBlobId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/f/?formId=${config.publishedBlobId}` : '');
  const [pubBlobId, setPubBlobId]   = useState(config.publishedBlobId ?? '');
  const [pubObjectId, setPubObjectId] = useState(config.publishedSuiObjectId ?? '');
  const [copied, setCopied]         = useState(false);

  function updateField(id: string, patch: Partial<SessionField>) {
    onChange({ ...config, fields: config.fields.map(f => f.id === id ? { ...f, ...patch } : f) });
  }
  function removeField(id: string) {
    onChange({ ...config, fields: config.fields.filter(f => f.id !== id) });
  }
  function addCustomField(f: SessionField) {
    onChange({ ...config, fields: [...config.fields, f] });
  }

  const connection = useWalletConnection();

  async function publish() {
    if (!connection.isConnected) {
      alert('Sui Wallet not found or disconnected. Please connect your wallet first.');
      return;
    }

    setPublishing(true);
    setPubMsg('Preparing form configuration…');
    try {
      console.log("-- PUBLISHING FORM...");
      
      const clonedFields = config.fields.map(f => ({
        ...f,
        options: f.options ? [...f.options] : undefined
      }));

      const cfg: FormConfig = { 
        ...config, 
        id: uid(), 
        type: 'form',
        createdAt: Date.now(), 
        publishedBy: ownerAddress, 
        fields: clonedFields,
        publishedBlobId: undefined 
      };

      // ── Sui Native Indexing: create Form object with JSON payload ──
      let suiObjectId = '';
      try {
        const { WALFORM_PACKAGE_ID, createFormObject } = await import('@/lib/walrus-onchain');
        if (WALFORM_PACKAGE_ID && WALFORM_PACKAGE_ID.startsWith('0x')) {
          console.log('[Sui] Creating Form object on-chain...');
          setPubMsg('Step 1/2: Creating Sui Form object…');
          
          const configJson = JSON.stringify(cfg);
          const txb = await createFormObject(cfg.id, configJson, ownerAddress);
          
          setPubMsg('Step 2/2: Awaiting wallet signature...');
          const { dAppKit } = await import('@/app/dapp-kit');
          const { getSuiClient } = await import('@/lib/walrus-onchain');

          // Use signTransaction + manual HTTP execute to avoid WebSocket timeout on Tatum RPC
          const { bytes, signature } = await dAppKit.signTransaction({ transaction: txb as any } as any);
          const client = getSuiClient() as any;

          // Execute via pure HTTP - no WebSocket subscription
          const execResult = await client.executeTransactionBlock({
            transactionBlock: bytes,
            signature,
            options: { showObjectChanges: true, showEffects: true },
            requestType: 'WaitForLocalExecution',
          });
          console.log('[Sui] Form object created:', execResult);

          // Extract objectChanges - may be directly in result or need polling
          let objectChanges = execResult?.objectChanges;

          if (!objectChanges && execResult?.digest) {
            const digest = execResult.digest;
            let txBlock = null;
            for (let i = 0; i < 15; i++) {
              try {
                txBlock = await client.getTransactionBlock({
                  digest,
                  options: { showObjectChanges: true },
                });
                if (txBlock?.objectChanges) break;
              } catch (e) { /* not yet finalized, retry */ }
              await new Promise(r => setTimeout(r, 2000));
            }
            objectChanges = txBlock?.objectChanges ?? [];
          }

          objectChanges = objectChanges ?? [];
          const created = objectChanges.find((c: any) => c.type === 'created' && c.objectType?.includes('::walform::Form'));
          if (created?.objectId) {
            suiObjectId = created.objectId;
            cfg.publishedSuiObjectId = suiObjectId;
            console.log('[Sui] Form object ID captured:', suiObjectId);
          } else {
            console.error('[Sui] execResult:', execResult, 'objectChanges:', objectChanges);
            throw new Error('Failed to capture Sui Form object ID from transaction result.');
          }
        } else {
          throw new Error('WALFORM_PACKAGE_ID is not configured.');
        }
      } catch (err: any) {
        console.error('[Sui] Form indexing failed:', err);
        throw new Error(`Sui transaction failed: ${err.message}`);
      }

      onChange(cfg);
      saveAdminConfig(cfg);
      // Removed Walrus cacheFormId since we don't have a blobId anymore
      // We will just register the form object ID in the registry
      try {
        await fetch('/api/registry/forms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerAddress, formObjectId: suiObjectId }),
        });
      } catch (regErr) {
        console.warn('[Registry] Forms registration failed (non-critical):', regErr);
      }

      setPubUrl(`${window.location.origin}/f/?formId=${suiObjectId}`);
      setPubObjectId(suiObjectId);
    } catch (e) { 
      console.error("Publish Error:", e);
      alert('Publish failed: ' + (e as Error).message); 
    }
    setPublishing(false);
  }


  function copy() { navigator.clipboard.writeText(pubUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  return (
    <div className="builder-split">
      {/* LEFT SIDE: Fields Management */}
      <div className="builder-left">
        <div>
          <h3 className="section-label" style={{ marginBottom: 12 }}>Form Fields</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: 20 }}>
            Configure your form fields. Drag and drop is coming soon!
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
          <div style={{ marginTop: 12 }}>
            <CustomFieldCreator onAdd={addCustomField} />
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Settings, Preview & Publish */}
      <div className="builder-right">
        {/* Publish Panel (Sticky) */}
        <div className="publish-panel">
          <h3 className="section-label" style={{ color: 'var(--accent-2)', marginBottom: 12 }}>Finalize & Publish</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="input-label" style={{ fontSize: 11 }}>Form Title</label>
              <input className="input" style={{ background: 'rgba(0,0,0,0.2)' }} value={config.title} onChange={e => onChange({ ...config, title: e.target.value })} />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(139,92,246,0.05)', borderRadius: 10, border: '1px solid rgba(139,92,246,0.1)' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-2)' }}>Seal Encryption</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Only you can decrypt responses.</p>
              </div>
              <input type="checkbox" className="toggle" checked={!!config.encryptionEnabled} 
                     onChange={e => onChange({ ...config, encryptionEnabled: e.target.checked })} />
            </div>

            <button 
              className="btn btn-primary btn-lg" 
              style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 800, boxShadow: 'var(--glow-md)' }} 
              onClick={publish} 
              disabled={publishing}
            >
              {publishing ? <><span className="spinner" /> Publishing...</> : '🚀 Publish Form'}
            </button>

            {pubUrl && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ padding: 12, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14 }}>✅</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>Live on Sui</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 6, fontSize: 10, color: 'var(--accent-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pubUrl}</div>
                  <button className="btn btn-secondary btn-sm" onClick={copy} style={{ height: 28, fontSize: 10 }}>{copied ? '✓' : 'Copy'}</button>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Form Settings Card */}
        <div className="card-premium" style={{ padding: 20 }}>
          <h3 className="section-label" style={{ marginBottom: 12 }}>Settings</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="input-label" style={{ fontSize: 11 }}>Description</label>
              <textarea className="textarea" rows={3} value={config.description}
                onChange={e => onChange({ ...config, description: e.target.value })}
                style={{ fontSize: 13 }} />
            </div>
          </div>
        </div>

        {/* Live Preview Placeholder */}
        <div style={{ padding: 20, border: '1px dashed var(--border)', borderRadius: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Preview</p>
          <div style={{ marginTop: 12, opacity: 0.4 }}>
            <div style={{ height: 10, background: 'var(--border-2)', width: '60%', borderRadius: 5, margin: '0 auto 8px' }} />
            <div style={{ height: 32, background: 'var(--border-2)', width: '100%', borderRadius: 8 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
