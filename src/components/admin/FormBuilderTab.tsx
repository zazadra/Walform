'use client';
import { useState, useEffect } from 'react';
import type { FormConfig, SessionField, SessionFieldType } from '@/types/walform';
import { saveAdminConfig } from '@/lib/fields';
import { motion, AnimatePresence } from 'framer-motion';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useIsMobile } from '@/hooks/useMediaQuery';

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
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      <div>
        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Field Label</label>
        <input className="input" value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} style={{ fontSize: '14px', padding: '12px 16px' }} />
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>Required Field</label>
        <input type="checkbox" className="toggle" checked={field.required} onChange={e => updateField(field.id, { required: e.target.checked })} />
      </div>

      <div>
        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Placeholder Text</label>
        <input className="input" placeholder="e.g. Enter value..." value={field.placeholder || ''} onChange={e => updateField(field.id, { placeholder: e.target.value })} style={{ fontSize: '14px', padding: '12px 16px' }} />
      </div>

      <div>
        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Help Text</label>
        <input className="input" placeholder="Optional instructions..." value={field.helpText || ''} onChange={e => updateField(field.id, { helpText: e.target.value })} style={{ fontSize: '14px', padding: '12px 16px' }} />
      </div>

      {['text', 'email', 'url', 'textarea'].includes(field.type) && (
        <div style={{ padding: '16px', background: 'rgba(13,148,136,0.05)', borderRadius: '16px', border: '1px solid rgba(13,148,136,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-2)' }}>Attached Checkbox</label>
            <input 
              type="checkbox" 
              className="toggle" 
              checked={!!field.attachedCheckbox} 
              onChange={e => {
                if (e.target.checked) {
                  updateField(field.id, { attachedCheckbox: { id: `checkbox_${field.id}`, label: '' } });
                } else {
                  updateField(field.id, { attachedCheckbox: undefined });
                }
              }} 
            />
          </div>
          {field.attachedCheckbox && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input 
                className="input" 
                placeholder="Checkbox Label" 
                value={field.attachedCheckbox.label} 
                onChange={e => updateField(field.id, { attachedCheckbox: { ...field.attachedCheckbox!, label: e.target.value } })}
                style={{ fontSize: '13px', background: 'rgba(0,0,0,0.2)' }}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>ID: <span className="mono">{field.attachedCheckbox.id}</span></p>
            </div>
          )}
        </div>
      )}

      {(field.type === 'select' || field.type === 'checkbox') && (
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Options (comma separated)</label>
          <textarea 
            className="textarea" 
            style={{ fontSize: '14px', minHeight: '100px', padding: '12px 16px' }}
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
export function FormBuilderTab({ config, onChange, ownerAddress, onShowToast }: {
  config: FormConfig;
  onChange: (c: FormConfig) => void;
  ownerAddress: string;
  onShowToast?: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [pubMsg, setPubMsg]         = useState('');
  const [pubUrl, setPubUrl]         = useState(config.publishedSuiObjectId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/f/?formId=${config.publishedSuiObjectId}` : config.publishedBlobId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/f/?formId=${config.publishedBlobId}` : '');
  const [copied, setCopied]         = useState(false);

  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const [mobileMode, setMobileMode] = useState<'elements' | 'builder' | 'settings'>('builder');
  const [coAdminInput, setCoAdminInput] = useState('');
  const [coAdminErr, setCoAdminErr] = useState('');
  const [showEncryptInfo, setShowEncryptInfo] = useState(false);

  useEffect(() => {
    if (activeFieldId && isMobile) setMobileMode('settings');
  }, [activeFieldId]);

  function reorderFields(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const newFields = [...config.fields];
    const [moved] = newFields.splice(fromIdx, 1);
    newFields.splice(toIdx, 0, moved);
    onChange({ ...config, fields: newFields });
  }

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
    if (isMobile) setMobileMode('builder');
  }
  
  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...config.fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    onChange({ ...config, fields: newFields });
  };

  const connection = useWalletConnection();

  async function publish() {
    if (!connection.isConnected) {
      if (onShowToast) onShowToast('Wallet not connected. Please connect first.', 'error');
      else alert('Sui Wallet not found or disconnected. Please connect your wallet first.');
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
        // Always include the publisher + any co-admins. Deduplicate and lowercase.
        admins: [...new Set([ownerAddress, ...(config.admins || [])].map(a => a.toLowerCase()))],
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
        } else {
          // BUG FIX: Explicitly strip any stale Seal keys when encryption is OFF.
          // Without this, a form re-published with encryption toggled off could
          // still carry the RSA public key from a previous publish session,
          // causing the submission page to encrypt data even though the admin
          // intended an open (unencrypted) form.
          delete configToPublish.sealPublicKeyJwk;
          delete configToPublish.sealedPrivateKey;
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
      if (onShowToast) onShowToast('Publish failed: ' + (e as Error).message, 'error');
      else alert('Publish failed: ' + (e as Error).message); 
    }
    setPublishing(false);
  }

  function copy() { navigator.clipboard.writeText(pubUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  const activeField = config.fields.find(f => f.id === activeFieldId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1280px', margin: '0 auto' }}>
      {isMobile && (
        <div className="tab-pill" style={{ marginBottom: '10px', padding: 6 }}>
          <button className={`tab-pill-btn ${mobileMode === 'elements' ? 'active' : ''}`} onClick={() => setMobileMode('elements')} style={{ flex: 1 }}>Add</button>
          <button className={`tab-pill-btn ${mobileMode === 'builder' ? 'active' : ''}`} onClick={() => setMobileMode('builder')} style={{ flex: 1 }}>Build</button>
          <button className={`tab-pill-btn ${mobileMode === 'settings' ? 'active' : ''}`} onClick={() => setMobileMode('settings')} style={{ flex: 1 }}>Settings</button>
        </div>
      )}
      
      <div style={{
        display: isMobile ? 'block' : 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(12, 1fr)',
        gap: '20px',
        alignItems: 'start'
      }}>
      {/* LEFT COLUMN: Elements (approx 20%) */}
      <div style={{ 
        gridColumn: 'span 3', 
        position: isMobile ? 'static' : 'sticky', 
        top: '24px', 
        display: isMobile ? (mobileMode === 'elements' ? 'flex' : 'none') : 'flex', 
        flexDirection: 'column', 
        gap: '16px' 
      }}>
        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '20px', backdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', textAlign: 'center' }}>
            Form Elements
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : '1fr', gap: '6px' }}>
            {FIELD_TYPES.map(type => (
              <motion.button
                key={type.value}
                whileHover={{ scale: 1.02, backgroundColor: 'rgba(13, 148, 136, 0.12)', borderColor: 'rgba(13, 148, 136, 0.4)' }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { addField(type.value); if(isMobile) setMobileMode('builder'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '10px',
                  color: 'var(--text-2)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: `${FIELD_TYPE_COLORS[type.value]}20`, color: FIELD_TYPE_COLORS[type.value], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>
                  {type.icon}
                </div>
                {type.label}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* CENTER COLUMN: Main Builder Area (approx 55%) */}
      <div style={{ 
        gridColumn: 'span 6', 
        height: isMobile ? 'auto' : 'calc(100vh - 240px)', 
        overflowY: isMobile ? 'visible' : 'auto', 
        display: isMobile ? (mobileMode === 'builder' ? 'block' : 'none') : 'block',
        padding: isMobile ? '20px 8px' : '20px 16px 40px 16px', 
        background: 'rgba(5, 10, 18, 0.4)',
        borderRadius: '24px',
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.2)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--accent) transparent'
      }}>
        <div style={{ marginBottom: '40px', padding: '0 8px' }}>
          <input 
            className="input-minimal"
            value={config.title}
            onChange={e => onChange({ ...config, title: e.target.value })}
            placeholder="Untitled Form"
            style={{ 
              fontSize: '28px', fontWeight: 900, color: 'var(--text-1)', padding: '8px 12px', height: 'auto', 
              background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', borderRadius: '12px', outline: 'none', 
              width: '100%', letterSpacing: '-0.02em', transition: 'all 0.2s' 
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(13,148,136,0.05)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
            title="Edit Form Title"
          />
          <textarea 
            className="input-minimal"
            value={config.description}
            onChange={e => onChange({ ...config, description: e.target.value })}
            placeholder="Add a description for your form..."
            rows={2}
            style={{ 
              fontSize: '15px', color: 'var(--text-2)', padding: '10px 12px', height: 'auto', 
              background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', borderRadius: '12px', outline: 'none', 
              width: '100%', marginTop: '12px', resize: 'vertical', lineHeight: 1.5, transition: 'all 0.2s' 
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(13,148,136,0.05)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
            title="Edit Form Description"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <AnimatePresence>
            {config.fields.map((f, idx) => {
              const isActive = activeFieldId === f.id;
              const isDragging = dragIdx === idx;
              const isDropTarget = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;
              return (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(idx);
                    (e as any).dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    (e as any).dataTransfer.dropEffect = 'move';
                    setDragOverIdx(idx);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIdx !== null) reorderFields(dragIdx, idx);
                    setDragIdx(null);
                    setDragOverIdx(null);
                  }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  onClick={() => {
                    setActiveFieldId(f.id);
                    if (isMobile) setMobileMode('settings');
                  }}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '14px',
                    background: isDragging ? 'rgba(13, 148, 136, 0.04)' : isActive ? 'rgba(13, 148, 136, 0.08)' : 'rgba(255,255,255,0.02)',
                    border: `2px solid ${isDropTarget ? 'var(--accent)' : isActive ? 'var(--accent)' : isDragging ? 'rgba(13,148,136,0.3)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    boxShadow: isDropTarget ? '0 0 0 2px rgba(13,148,136,0.3)' : isActive ? '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.05)' : 'none',
                    position: 'relative',
                    transition: 'border-color 0.15s, background-color 0.15s, opacity 0.15s',
                    opacity: isDragging ? 0.5 : 1,
                    marginBottom: '6px',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                    {/* Drag Handle */}
                    <div
                      title="Drag to reorder"
                      style={{
                        cursor: 'grab', color: 'var(--text-3)', flexShrink: 0,
                        display: 'flex', alignItems: 'center', padding: '4px 2px',
                        borderRadius: '6px', transition: 'color 0.15s',
                        fontSize: '16px', lineHeight: 1, letterSpacing: '0.05em'
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-2)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                    >
                      ⠿
                    </div>
                    
                    {/* Icon */}
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: `${FIELD_TYPE_COLORS[f.type]}15`, border: `1px solid ${FIELD_TYPE_COLORS[f.type]}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FIELD_TYPE_COLORS[f.type], fontSize: '15px', flexShrink: 0 }}>
                      {FIELD_TYPES.find(t => t.value === f.type)?.icon}
                    </div>
                    
                    {/* Content */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label || 'Untitled Field'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-3)', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{f.type}</span>
                        {f.required && <span style={{ color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.04em' }}>REQUIRED</span>}
                        {f.attachedCheckbox && <span style={{ color: 'var(--accent-2)', background: 'rgba(13,148,136,0.1)', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>+CB</span>}
                      </div>
                    </div>
                    
                    {/* Delete */}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeField(f.id); }}
                      style={{
                        width: '28px', height: '28px', borderRadius: '8px', background: 'transparent', border: 'none',
                        color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
                      title="Delete Field"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  {/* Glassmorphism ambient glow if active */}
                  {isActive && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '70%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(13, 148, 136, 0.12), transparent 70%)', pointerEvents: 'none' }} />}
                </motion.div>
              );
            })}
          </AnimatePresence>
          {config.fields.length === 0 && (
            <div style={{ padding: '80px 40px', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: '32px', color: 'var(--text-3)', background: 'rgba(255,255,255,0.01)' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>✨</div>
              <h4 style={{ color: 'var(--text-2)', fontWeight: 700, fontSize: '20px', marginBottom: '12px' }}>Empty Canvas</h4>
              <p style={{ fontSize: '16px', maxWidth: '340px', margin: '0 auto', lineHeight: 1.6 }}>Choose an element from the left panel to start building your form.</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Settings & Publish — always-visible fixed layout */}
      <div style={{ 
        gridColumn: 'span 3', 
        position: isMobile ? 'static' : 'sticky', 
        top: '24px', 
        display: isMobile ? (mobileMode === 'settings' ? 'flex' : 'none') : 'flex',
        height: isMobile ? 'auto' : 'calc(100vh - 240px)',
        flexDirection: 'column', 
        gap: '0',
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid var(--border)', 
        borderRadius: '24px', 
        backdropFilter: 'blur(20px)',
        overflow: 'hidden'
      }}>
        
        {/* Field Settings — scrollable, takes available space */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', scrollbarWidth: 'thin', scrollbarColor: 'var(--accent) transparent' }}>
          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px', textAlign: 'center', flexShrink: 0 }}>
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
                style={{ textAlign: 'center', color: 'var(--text-3)', padding: '40px 0' }}
              >
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚙️</div>
                <p style={{ fontSize: '13px', maxWidth: '180px', margin: '0 auto', lineHeight: 1.5 }}>Select a field to edit its settings.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Publish Action — fixed at bottom, always visible */}
        <div style={{ flexShrink: 0, padding: '12px 16px', background: 'rgba(5,10,18,0.85)', borderTop: '1px solid var(--border)' }}>
          {/* Co-Admins section */}
          <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>👥 Co-Admins</p>
            <p style={{ fontSize: '10px', color: 'var(--text-3)', marginBottom: '8px', lineHeight: 1.5 }}>Add wallets that can view this form's responses. Saved on-chain at publish time.</p>
            {(config.admins || []).filter(a => a.toLowerCase() !== ownerAddress.toLowerCase()).map(addr => (
              <div key={addr} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, marginBottom: 4 }}>
                <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr.slice(0,8)}…{addr.slice(-6)}</span>
                <button
                  onClick={() => onChange({ ...config, admins: (config.admins || []).filter(a => a !== addr) })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 13, padding: 0 }}
                  title="Remove co-admin"
                >✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input
                className="input"
                placeholder="0x..."
                value={coAdminInput}
                onChange={e => { setCoAdminInput(e.target.value); setCoAdminErr(''); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const addr = coAdminInput.trim().toLowerCase();
                    if (!addr.startsWith('0x') || addr.length < 10) { setCoAdminErr('Invalid address'); return; }
                    if ((config.admins || []).map(a => a.toLowerCase()).includes(addr)) { setCoAdminErr('Already added'); return; }
                    onChange({ ...config, admins: [...(config.admins || []), addr] });
                    setCoAdminInput('');
                  }
                }}
                style={{ fontSize: 11, flex: 1, height: 32, padding: '0 10px' }}
              />
              <button
                className="btn btn-primary btn-sm"
                style={{ flexShrink: 0, padding: '0 12px', height: 32, fontSize: 16, lineHeight: 1 }}
                onClick={() => {
                  const addr = coAdminInput.trim().toLowerCase();
                  if (!addr.startsWith('0x') || addr.length < 10) { setCoAdminErr('Invalid address'); return; }
                  if ((config.admins || []).map(a => a.toLowerCase()).includes(addr)) { setCoAdminErr('Already added'); return; }
                  onChange({ ...config, admins: [...(config.admins || []), addr] });
                  setCoAdminInput('');
                }}
              >+</button>
            </div>
            {coAdminErr && <p style={{ fontSize: 10, color: 'var(--error)', marginTop: 4 }}>{coAdminErr}</p>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-2)', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>🚀 Finalize &amp; Publish</span>
            <label
              style={{ fontSize: '11px', fontWeight: 600, color: config.encryptionEnabled ? 'var(--accent-2)' : 'var(--text-3)', transition: 'color 0.2s', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {config.encryptionEnabled ? '🔒' : '🔓'} Encrypt
              <button
                onClick={() => setShowEncryptInfo(true)}
                style={{
                  width: 16, height: 16, borderRadius: '50%', border: '1px solid currentColor',
                  background: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: config.encryptionEnabled ? 'var(--accent-2)' : 'var(--text-3)',
                  lineHeight: 1, padding: 0, flexShrink: 0
                }}
                title="Learn about encryption"
              >?</button>
            </label>
            <input type="checkbox" className="toggle" checked={!!config.encryptionEnabled} onChange={e => onChange({ ...config, encryptionEnabled: e.target.checked })} title={config.encryptionEnabled ? 'Click to disable encryption' : 'Click to enable encryption'} />
          </div>

          <motion.button 
            whileHover={{ scale: 1.02, boxShadow: '0 8px 25px rgba(13, 148, 136, 0.5)' }}
            whileTap={{ scale: 0.98 }}
            className="btn btn-primary" 
            style={{ width: '100%', height: '44px', fontSize: '14px', fontWeight: 800, borderRadius: '12px' }} 
            onClick={publish} 
            disabled={publishing}
          >
            {publishing ? <><span className="spinner" style={{width:16,height:16}} /> Publishing...</> : '🚀 Publish Form'}
          </motion.button>

          {pubUrl && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.3)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>✅</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-2)', flex: 1 }}>Live on Sui</span>
              <button className="btn btn-secondary btn-sm" onClick={copy} style={{ height: '28px', fontSize: '11px', padding: '0 10px', borderRadius: '8px' }}>{copied ? '✓' : 'Copy'}</button>
              <a href={pubUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ height: '28px', fontSize: '11px', padding: '0 10px', borderRadius: '8px' }}>Open ↗</a>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  </div>

  {/* Encryption Info Modal */}
  <AnimatePresence>
    {showEncryptInfo && (
      <motion.div
        key="encrypt-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setShowEncryptInfo(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
      >
        <motion.div
          key="encrypt-modal"
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          style={{
            maxWidth: 420, width: '100%',
            background: 'rgba(10,14,24,0.96)',
            border: '1px solid rgba(139,92,246,0.35)',
            borderRadius: 24,
            padding: 28,
            boxShadow: '0 0 60px rgba(139,92,246,0.25), 0 24px 60px rgba(0,0,0,0.6)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em', margin: 0 }}>
                Seal Encryption
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Apa yang dilakukan toggle ini?</p>
            </div>
            <button
              onClick={() => setShowEncryptInfo(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 20, padding: 0, lineHeight: 1, marginLeft: 12 }}
            >✕</button>
          </div>

          {/* ON vs OFF comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div style={{ padding: '12px 14px', background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.25)', borderRadius: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-2)', marginBottom: 8, letterSpacing: '0.05em' }}>🔒 ON</p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
                Data submission di-<strong>enkripsi</strong> sebelum disimpan ke Walrus. Hanya wallet pembuat form yang bisa mendekripsi & membaca isinya.
              </p>
            </div>
            <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.05em' }}>🔓 OFF</p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
                Data tersimpan sebagai <strong>plaintext</strong>. Co-admin dan siapa saja yang punya Sui Object ID dapat membaca semua response.
              </p>
            </div>
          </div>

          {/* Warning box */}
          <div style={{
            padding: '14px 16px',
            background: 'rgba(251,146,60,0.08)',
            border: '1px solid rgba(251,146,60,0.35)',
            borderRadius: 14,
            marginBottom: 20,
          }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#fb923c', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚠️ Penting untuk Co-Admin
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>
              Jika enkripsi <strong style={{ color: '#fb923c' }}>ON</strong>, co-admin yang Anda tambahkan <strong>tidak bisa mendekripsi</strong> isi response — mereka hanya bisa membuka panel admin tapi data tetap terkunci.
              <br /><br />
              <strong style={{ color: '#4ade80' }}>Solusi:</strong> Matikan enkripsi (<strong>OFF</strong>) jika Anda ingin co-admin bisa membaca isi response.
            </p>
          </div>

          {/* Quick action */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1, height: 40, fontSize: 13 }}
              onClick={() => setShowEncryptInfo(false)}
            >
              Mengerti
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, height: 40, fontSize: 13 }}
              onClick={() => {
                onChange({ ...config, encryptionEnabled: !config.encryptionEnabled });
                setShowEncryptInfo(false);
              }}
            >
              {config.encryptionEnabled ? '🔓 Matikan Enkripsi' : '🔒 Nyalakan Enkripsi'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
}
