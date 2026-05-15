'use client';
import { useState, useEffect } from 'react';
import type { FormConfig, SessionField, SessionFieldType } from '@/types/walform';
import { saveAdminConfig } from '@/lib/fields';
import { motion, AnimatePresence } from 'framer-motion';
import { useWalletConnection } from '@/hooks/useWalletConnection';

function uid() { return Math.random().toString(36).slice(2, 9); }

const FIELD_TYPE_COLORS: Record<string, string> = {
  text:'#60a5fa', email:'#34d399', url:'#22d3ee', textarea:'#818cf8',
  checkbox:'#fbbf24', select:'#a78bfa', file:'#f97316',
};

const FIELD_TYPES: { value: SessionFieldType; label: string; icon: string }[] = [
  { value:'text',     label:'Short Text',  icon: 'T' },
  { value:'textarea', label:'Long Text',   icon: '☰' },
  { value:'email',    label:'Email',       icon: '@' },
  { value:'url',      label:'URL / Link',  icon: '🔗' },
  { value:'select',   label:'Dropdown',    icon: '▼' },
  { value:'checkbox', label:'Checkbox',    icon: '☑' },
  { value:'file',     label:'File Upload', icon: '📎'},
];

// -- Sub-components -----------------------------------------------------

function FieldSettingsEditor({ field, updateField }: { field: SessionField, updateField: (id: string, patch: Partial<SessionField>) => void }) {
  const [optionsText, setOptionsText] = useState(field.options?.join(', ') ?? '');

  useEffect(() => {
    const ext = field.options?.join(', ') ?? '';
    const loc = optionsText.split(',').map(s => s.trim()).filter(Boolean).join(', ');
    if (ext !== loc) setOptionsText(ext);
  }, [field.options]);

  return (
    <motion.div
      key={field.id}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Field Label</label>
        <input className="input" value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} style={{ fontSize: '13px' }} />
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-1)' }}>Required Field</label>
        <input type="checkbox" className="toggle" checked={field.required} onChange={e => updateField(field.id, { required: e.target.checked })} />
      </div>

      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Placeholder Text</label>
        <input className="input" placeholder="e.g. Enter value..." value={field.placeholder || ''} onChange={e => updateField(field.id, { placeholder: e.target.value })} style={{ fontSize: '13px' }} />
      </div>

      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Help Text</label>
        <input className="input" placeholder="Optional instructions..." value={field.helpText || ''} onChange={e => updateField(field.id, { helpText: e.target.value })} style={{ fontSize: '13px' }} />
      </div>

      {(field.type === 'select' || field.type === 'checkbox') && (
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Options (comma separated)</label>
          <textarea 
            className="textarea" 
            style={{ fontSize: '13px', minHeight: '80px' }}
            value={optionsText} 
            onChange={e => {
              const val = e.target.value;
              setOptionsText(val);
              const parsed = val.split(',').map(s => s.trim()).filter(Boolean);
              if (JSON.stringify(parsed) !== JSON.stringify(field.options || [])) {
                updateField(field.id, { options: parsed });
              }
            }} 
          />
        </div>
      )}
    </motion.div>
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
  const [copied, setCopied]         = useState(false);

  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);

  function updateField(id: string, patch: Partial<SessionField>) {
    onChange({ ...config, fields: config.fields.map(f => f.id === id ? { ...f, ...patch } : f) });
  }
  function removeField(id: string) {
    onChange({ ...config, fields: config.fields.filter(f => f.id !== id) });
    if (activeFieldId === id) setActiveFieldId(null);
  }
  function addField(type: SessionFieldType) {
    const f: SessionField = {
      id: 'field_' + uid(),
      label: `New ${FIELD_TYPES.find(t => t.value === type)?.label}`,
      type,
      required: false,
      enabled: true,
      options: (type === 'select' || type === 'checkbox') ? ['Option 1'] : undefined
    };
    onChange({ ...config, fields: [...config.fields, f] });
    setActiveFieldId(f.id);
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

      let suiObjectId = '';
      const { WALFORM_PACKAGE_ID, createFormObject } = await import('@/lib/walrus-onchain');
      if (WALFORM_PACKAGE_ID && WALFORM_PACKAGE_ID.startsWith('0x')) {
        let configToPublish = { ...cfg };
        
        if (cfg.encryptionEnabled) {
          setPubMsg('Step 1/3: Generating Security Seal...');
          const { dAppKit } = await import('@/app/dapp-kit');
          const sealMsg = `Walform Security Seal\nForm ID: ${cfg.id}\n\nSign this message to authorize encryption/decryption.`;
          const { signature } = await dAppKit.signPersonalMessage({ message: new TextEncoder().encode(sealMsg) });
          const { generateSeal } = await import('@/lib/seal');
          const { publicKeyJwk, sealedPrivateKey } = await generateSeal(signature);
          configToPublish.sealPublicKeyJwk = publicKeyJwk;
          configToPublish.sealedPrivateKey = sealedPrivateKey;
        }

        setPubMsg('Step 2/3: Creating Sui Form object…');
        const configJson = JSON.stringify(configToPublish);
        const txb = await createFormObject(cfg.id, configJson, ownerAddress);
        
        setPubMsg('Step 3/3: Awaiting wallet signature...');
        const { dAppKit } = await import('@/app/dapp-kit');
        const { getSuiClient } = await import('@/lib/walrus-onchain');

        const { bytes, signature } = await dAppKit.signTransaction({ transaction: txb as any } as any);
        const client = getSuiClient() as any;

        const execResult = await client.executeTransactionBlock({
          transactionBlock: bytes,
          signature,
          options: { showObjectChanges: true, showEffects: true },
          requestType: 'WaitForLocalExecution',
        });

        let objectChanges = execResult?.objectChanges;
        if (!objectChanges && execResult?.digest) {
          const digest = execResult.digest;
          let txBlock = null;
          for (let i = 0; i < 15; i++) {
            try {
              txBlock = await client.getTransactionBlock({ digest, options: { showObjectChanges: true } });
              if (txBlock?.objectChanges) break;
            } catch (e) { /* retry */ }
            await new Promise(r => setTimeout(r, 2000));
          }
          objectChanges = txBlock?.objectChanges ?? [];
        }

        objectChanges = objectChanges ?? [];
        const created = objectChanges.find((c: any) => c.type === 'created' && c.objectType?.includes('::walform::Form'));
        if (created?.objectId) {
          suiObjectId = created.objectId;
          cfg.publishedSuiObjectId = suiObjectId;
        } else {
          throw new Error('Failed to capture Sui Form object ID from transaction result.');
        }
      } else {
        throw new Error('WALFORM_PACKAGE_ID is not configured.');
      }

      onChange(cfg);
      saveAdminConfig(cfg);
      try {
        await fetch('/api/registry/forms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerAddress, formObjectId: suiObjectId }),
        });
      } catch (regErr) {}

      setPubUrl(`${window.location.origin}/f/?formId=${suiObjectId}`);
    } catch (e) { 
      alert('Publish failed: ' + (e as Error).message); 
    }
    setPublishing(false);
  }

  function copy() { navigator.clipboard.writeText(pubUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  const activeField = config.fields.find(f => f.id === activeFieldId);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gap: '24px',
      alignItems: 'start',
      minHeight: '600px'
    }}>
      {/* LEFT COLUMN: Elements (approx 20%) */}
      <div style={{ gridColumn: 'span 3', position: 'sticky', top: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '16px', backdropFilter: 'blur(10px)' }}>
          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
            Form Elements
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            {FIELD_TYPES.map(type => (
              <motion.button
                key={type.value}
                whileHover={{ scale: 1.02, backgroundColor: 'rgba(13, 148, 136, 0.08)', borderColor: 'rgba(13, 148, 136, 0.3)' }}
                whileTap={{ scale: 0.98 }}
                onClick={() => addField(type.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                  background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '10px',
                  color: 'var(--text-2)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: `${FIELD_TYPE_COLORS[type.value]}20`, color: FIELD_TYPE_COLORS[type.value], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                  {type.icon}
                </div>
                {type.label}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* CENTER COLUMN: Main Builder Area (approx 55%) */}
      <div style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ marginBottom: '12px' }}>
          <input 
            className="input-minimal"
            value={config.title}
            onChange={e => onChange({ ...config, title: e.target.value })}
            placeholder="Form Title"
            style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-1)', padding: 0, height: 'auto', background: 'transparent', border: 'none', outline: 'none', width: '100%' }}
          />
          <input 
            className="input-minimal"
            value={config.description}
            onChange={e => onChange({ ...config, description: e.target.value })}
            placeholder="Form description..."
            style={{ fontSize: '14px', color: 'var(--text-3)', padding: 0, height: 'auto', background: 'transparent', border: 'none', outline: 'none', width: '100%', marginTop: '8px' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <AnimatePresence>
            {config.fields.map(f => {
              const isActive = activeFieldId === f.id;
              return (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => setActiveFieldId(f.id)}
                  whileHover={{ borderColor: isActive ? 'var(--accent-soft)' : 'rgba(255,255,255,0.15)' }}
                  style={{
                    padding: '16px',
                    borderRadius: '16px',
                    background: isActive ? 'rgba(13, 148, 136, 0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isActive ? 'var(--accent-soft)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 8px 30px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.05)' : 'none',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${FIELD_TYPE_COLORS[f.type]}15`, border: `1px solid ${FIELD_TYPE_COLORS[f.type]}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FIELD_TYPE_COLORS[f.type], fontWeight: 800, fontSize: '12px' }}>
                        {FIELD_TYPES.find(t => t.value === f.type)?.icon}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>{f.label || 'Untitled Field'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-3)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ textTransform: 'capitalize' }}>{f.type}</span>
                          {f.required && <span style={{ color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700 }}>REQUIRED</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ opacity: isActive ? 1 : 0.4, transition: 'opacity 0.2s', display: 'flex', gap: '8px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeField(f.id); }}
                        style={{
                          width: '30px', height: '30px', borderRadius: '8px', background: 'transparent', border: 'none',
                          color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </div>
                  {/* Glassmorphism ambient glow if active */}
                  {isActive && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '60%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(13, 148, 136, 0.15), transparent 70%)', pointerEvents: 'none' }} />}
                </motion.div>
              );
            })}
          </AnimatePresence>
          {config.fields.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '16px', color: 'var(--text-3)' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>✨</div>
              <p style={{ fontSize: '13px' }}>Click an element on the left to add it to your form.</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Settings & Publish (approx 25%) */}
      <div style={{ gridColumn: 'span 3', position: 'sticky', top: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Publish Action Card */}
        <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '16px', backdropFilter: 'blur(10px)', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
            Finalize & Publish
          </h3>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(13,148,136,0.05)', borderRadius: '10px', border: '1px solid rgba(13,148,136,0.1)', marginBottom: '16px' }}>
            <div>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-1)' }}>Seal Encryption</p>
              <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>E2E security for responses.</p>
            </div>
            <input type="checkbox" className="toggle" checked={!!config.encryptionEnabled} onChange={e => onChange({ ...config, encryptionEnabled: e.target.checked })} />
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn btn-primary" 
            style={{ width: '100%', height: '44px', fontSize: '13px', fontWeight: 800, boxShadow: '0 4px 15px rgba(13, 148, 136, 0.4)' }} 
            onClick={publish} 
            disabled={publishing}
          >
            {publishing ? <><span className="spinner" style={{width:16,height:16}} /> Publishing...</> : '🚀 Publish Form'}
          </motion.button>

          {pubUrl && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: '16px', padding: '12px', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px' }}>✅</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#4ade80' }}>Live on Sui</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '6px', fontSize: '10px', color: 'var(--accent-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pubUrl}</div>
                <button className="btn btn-secondary btn-sm" onClick={copy} style={{ height: '24px', fontSize: '9px', padding: '0 8px' }}>{copied ? '✓' : 'Copy'}</button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Field Settings Card */}
        <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '16px', backdropFilter: 'blur(10px)', minHeight: '300px' }}>
          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
            Field Settings
          </h3>
          
          <AnimatePresence mode="wait">
            {activeField ? (
              <FieldSettingsEditor field={activeField} updateField={updateField} />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ textAlign: 'center', color: 'var(--text-3)', padding: '20px 0' }}
              >
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>⚙️</div>
                <p style={{ fontSize: '12px' }}>Select a field from the canvas to edit its properties.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
