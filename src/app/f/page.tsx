'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useCurrentAccount, useCurrentWallet } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { readJsonFromWalrus, uploadJsonToWalrus, uploadBytesToWalrus } from '@/lib/walrus';
import { getFormByObjectId } from '@/lib/walrus-onchain';
import type { FormConfig, Submission, SessionField } from '@/types/walform';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';

function uid() { return Math.random().toString(36).slice(2, 10); }
function shorten(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

// ── Flow step state ──────────────────────────────────────────────
type FlowStep = 'idle' | 'uploading' | 'done' | 'error';
interface FlowState {
  walrus: FlowStep;
  suiTx: FlowStep;
  receipt: FlowStep;
}

// ── Field renderer ───────────────────────────────────────────────
function FieldInput({ field, value, onChange, onFile, uploading }: {
  field: SessionField;
  value: string | string[] | boolean;
  onChange: (v: string | string[] | boolean) => void;
  onFile: (f: File | File[]) => Promise<void>;
  uploading: boolean;
}) {
  const base = value as string;
  switch (field.type) {
    case 'text': case 'email':
      return <input type={field.type} className="input" placeholder={field.placeholder} value={base || ''} onChange={e => onChange(e.target.value)} />;
    case 'url':
      return <input type="url" className="input" placeholder={field.placeholder || 'https://'} value={base || ''} onChange={e => onChange(e.target.value)} />;
    case 'textarea':
      return <textarea className="textarea" placeholder={field.placeholder} rows={4} value={base || ''} onChange={e => onChange(e.target.value)} />;
    case 'select':
      return (
        <select className="select" value={base || ''} onChange={e => onChange(e.target.value)} style={{ background: 'var(--card)', color: 'var(--text-1)' }}>
          <option value="">Select option…</option>
          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'checkbox':
      if (field.options && field.options.length > 0) {
        const selected = (value as string[]) || [];
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {field.options.map(opt => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-2)' }}>
                <input type="checkbox" checked={selected.includes(opt)} onChange={e => onChange(e.target.checked ? [...selected, opt] : selected.filter(s => s !== opt))} style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        );
      }
      return (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-2)' }}>
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
          <span>{field.label}{field.linkUrl && <> – <a href={field.linkUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-2)' }}>{field.linkText || field.linkUrl}</a></>}</span>
        </label>
      );
    case 'rating': {
      const num = Number(value) || 0;
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} className="star-btn" onClick={() => onChange(String(n))} type="button">
              <span style={{ fontSize: '28px', color: n <= num ? '#fbbf24' : 'rgba(255,255,255,0.15)', transition: 'color 0.12s' }}>★</span>
            </button>
          ))}
        </div>
      );
    }
    case 'file': {
      const triggerInput = () => (document.getElementById(`fi-${field.id}`) as HTMLInputElement)?.click();
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input id={`fi-${field.id}`} type="file" multiple style={{ display: 'none' }} onChange={async e => { const files = Array.from(e.target.files || []); if (files.length) await onFile(files); e.target.value = ''; }} />
          <button type="button" onClick={triggerInput} className="btn btn-secondary btn-sm" disabled={uploading} style={{ width: 'fit-content' }}>
            {uploading ? <><span className="spinner" />Uploading…</> : 'Choose File'}
          </button>
          {Array.isArray(value) && (value as string[]).map((blobId, i) => (
            <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
              📎 blob-{blobId.slice(0, 20)}…
            </div>
          ))}
          {value && typeof value === 'string' && (
            <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
              📎 blob-{(value as string).slice(0, 20)}…
            </div>
          )}
        </div>
      );
    }
    default:
      return <input type="text" className="input" placeholder={field.placeholder} value={base || ''} onChange={e => onChange(e.target.value)} />;
  }
}

// ── Flow Sidebar ─────────────────────────────────────────────────
function FlowSidebar({ flow, receipt }: {
  flow: FlowState;
  receipt: { blobId: string; txDigest: string; rootHash: string } | null;
}) {
  const steps = [
    { key: 'walrus' as const, label: 'Walrus writeBlob' },
    { key: 'suiTx' as const, label: 'Sui submit_response' },
    { key: 'receipt' as const, label: 'Receipt minted' },
  ];

  function stepIcon(s: FlowStep) {
    if (s === 'done') return <span style={{ color: 'var(--success)', fontSize: 14 }}>✓</span>;
    if (s === 'uploading') return <span className="spinner" style={{ width: 12, height: 12 }} />;
    if (s === 'error') return <span style={{ color: 'var(--error)', fontSize: 14 }}>✗</span>;
    return <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--border)', display: 'inline-block' }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Flow steps */}
      <div className="card" style={{ padding: '20px', borderRadius: 'var(--r-lg)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 14 }}>FLOW</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {steps.map((step, i) => (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: flow[step.key] === 'done' ? 'rgba(16,185,129,0.1)' : flow[step.key] === 'uploading' ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${flow[step.key] === 'done' ? 'var(--success)' : flow[step.key] === 'uploading' ? 'var(--accent)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', flexShrink: 0
              }}>
                {flow[step.key] === 'idle' ? i + 1 : stepIcon(flow[step.key])}
              </div>
              <span style={{ fontSize: 13, color: flow[step.key] === 'done' ? 'var(--text-1)' : flow[step.key] === 'uploading' ? 'var(--accent-2)' : 'var(--text-3)', fontWeight: flow[step.key] !== 'idle' ? 600 : 400, transition: 'color 0.2s' }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Receipt */}
      <AnimatePresence>
        {receipt && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
            style={{ padding: '20px', borderRadius: 'var(--r-lg)', borderColor: 'rgba(16,185,129,0.25)' }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--success)', marginBottom: 14 }}>SUBMISSION SAVED</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: 'Blob ID', value: receipt.blobId },
                { label: 'Tx digest', value: receipt.txDigest },
                { label: 'Root hash', value: receipt.rootHash },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', wordBreak: 'break-all', lineHeight: 1.6 }}>{value || '—'}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page content (needs Suspense boundary for useSearchParams) ──
function FormPageContent() {
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const searchParams = useSearchParams();
  const formObjectId = searchParams.get('formId') || '';

  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [data, setData] = useState<Record<string, string | string[] | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileUploading, setFileUploading] = useState<Record<string, boolean>>({});

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [flow, setFlow] = useState<FlowState>({ walrus: 'idle', suiTx: 'idle', receipt: 'idle' });
  const [receipt, setReceipt] = useState<{ blobId: string; txDigest: string; rootHash: string } | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  // ── Load form from Sui object ──
  useEffect(() => {
    if (!formObjectId) { setLoading(false); return; }
    (async () => {
      try {
        const obj = await getFormByObjectId(formObjectId);
        if (!obj) throw new Error('Form object not found on Sui.');
        
        let cfg: FormConfig;
        try {
          cfg = JSON.parse(obj.configJson);
        } catch (e) {
          throw new Error('Form configuration on Sui is malformed.');
        }

        if (!cfg || !cfg.fields) throw new Error('Invalid form configuration format.');
        setConfig(cfg);
      } catch (e: any) {
        setLoadErr(e.message || 'Failed to load form.');
      }
      setLoading(false);
    })();
  }, [formObjectId]);

  // ── File upload ──
  async function handleFile(fieldId: string, files: File | File[]) {
    if (!account) { setErrors(e => ({ ...e, [fieldId]: 'Connect your wallet to upload files.' })); return; }
    setFileUploading(u => ({ ...u, [fieldId]: true }));
    try {
      const signer = { address: account.address, signAndExecute: async (tx: unknown) => { const r = await dAppKit.signAndExecuteTransaction({ transaction: tx as any }); const digest = (r as any)?.Transaction?.digest ?? (r as any)?.digest; if (!digest) throw new Error('Wallet signing failed'); return { digest }; } };
      const fileArray = Array.isArray(files) ? files : [files];
      const ids: string[] = [];
      for (const f of fileArray) { const res = await uploadBytesToWalrus(f, signer, 3); ids.push(res.blobId); }
      setData(d => { const ex = d[fieldId]; const arr = Array.isArray(ex) ? ex : (ex && typeof ex === 'string' ? [ex] : []); const combined = [...(arr as string[]), ...ids]; return { ...d, [fieldId]: combined.length === 1 ? combined[0] : combined }; });
      setErrors(e => { const n = { ...e }; delete n[fieldId]; return n; });
    } catch (err: any) { setErrors(e => ({ ...e, [fieldId]: err.message || 'File upload failed.' })); }
    setFileUploading(u => ({ ...u, [fieldId]: false }));
  }

  // ── Validate ──
  function validate(): boolean {
    if (!config) return false;
    const errs: Record<string, string> = {};
    config.fields.filter(f => f.enabled && f.required).forEach(f => {
      const v = data[f.id];
      if (v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)) errs[f.id] = 'This field is required.';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ──
  async function handleSubmit() {
    if (!validate() || !config) return;
    if (!account) { setErrMsg('Please connect your wallet to submit.'); return; }

    setStatus('submitting');
    setErrMsg('');
    setFlow({ walrus: 'uploading', suiTx: 'idle', receipt: 'idle' });

    try {
      const submissionId = uid();
      const timestamp = Date.now();

      const submission: Submission = {
        id: submissionId,
        formId: formObjectId,
        formBlobId: formObjectId,
        data,
        submitterAddress: account.address,
        timestamp,
        status: 'new',
      };

      const signer = {
        address: account.address,
        signAndExecute: async (tx: unknown) => {
          const r = await dAppKit.signAndExecuteTransaction({ transaction: tx as any });
          const digest = (r as any)?.Transaction?.digest ?? (r as any)?.digest;
          if (!digest) throw new Error('Wallet signing failed or cancelled.');
          return { digest };
        },
      };

      // Step 1: Serialize submission payload
      const payloadJson = JSON.stringify(submission);
      setFlow({ walrus: 'done', suiTx: 'uploading', receipt: 'idle' });

      // Step 2: Sui submit_response tx
      let txDigest = '';
      try {
        const { createSubmissionObject, getSuiClient } = await import('@/lib/walrus-onchain');
        // Owner harus submitter, bukan admin
        const txb = await createSubmissionObject(formObjectId, payloadJson, 'new', account.address);
        const { bytes, signature } = await dAppKit.signTransaction({ transaction: txb as any } as any);
        const client = getSuiClient() as any;
        const execResult = await client.executeTransactionBlock({
          transactionBlock: bytes,
          signature,
          options: { showEffects: true },
          requestType: 'WaitForLocalExecution',
        });
        txDigest = execResult?.digest ?? '';
      } catch (txErr) {
        console.error('[Sui] submit_response tx failed:', txErr);
        throw new Error('Failed to register submission on Sui.');
      }
      setFlow({ walrus: 'done', suiTx: 'done', receipt: 'uploading' });

      // Register in server registry
      try {
        const walrusBlobId = config.publishedBlobId || '';
        await fetch('/api/registry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ formBlobId: walrusBlobId, submissionBlobId: 'sui-native', formObjectId }) });
      } catch { /* non-fatal */ }

      setFlow({ walrus: 'done', suiTx: 'done', receipt: 'done' });
      setReceipt({ blobId: 'Stored on Sui', txDigest, rootHash: 'N/A' });
      setStatus('success');
    } catch (e: any) {
      setFlow(f => ({ ...f, walrus: f.walrus === 'uploading' ? 'error' : f.walrus, suiTx: f.suiTx === 'uploading' ? 'error' : f.suiTx }));
      setErrMsg(e.message || 'Submission failed.');
      setStatus('error');
    }
  }

  // ── No formId ──
  if (!formObjectId) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--text-3)', textAlign: 'center', padding: '40px 24px' }}>
      <div style={{ fontSize: 48 }}>📋</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>No Form ID</h2>
      <p>Use <span className="mono" style={{ color: 'var(--accent-2)', fontSize: 13 }}>/f/?formId=0x...</span> to load a specific form.</p>
      <a href="/templates" className="btn btn-primary btn-sm">Browse Templates</a>
    </div>
  );

  // ── Loading ──
  if (loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)' }}>
      <span className="spinner" style={{ width: 20, height: 20 }} />
      <span>Loading form from Sui + Walrus…</span>
    </div>
  );

  // ── Error loading ──
  if (loadErr || !config) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-3)', textAlign: 'center', padding: '40px 24px' }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--error)' }}>Failed to Load Form</h2>
      <p style={{ fontSize: 14 }}>{loadErr || 'Form data could not be retrieved.'}</p>
      <p className="mono" style={{ fontSize: 12, padding: '8px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8 }}>{formObjectId}</p>
    </div>
  );

  const enabledFields = config.fields.filter(f => f.enabled);
  const totalSteps = enabledFields.length;
  const progress = totalSteps > 0 ? ((currentStep) / totalSteps) * 100 : 0;

  function goNext() {
    const field = enabledFields[currentStep];
    if (field?.required) {
      const v = data[field.id];
      if (!v || v === '' || (Array.isArray(v) && v.length === 0)) {
        setErrors(e => ({ ...e, [field.id]: 'This field is required.' }));
        return;
      }
    }
    setErrors(e => { const n = { ...e }; if (field) delete n[field.id]; return n; });
    if (currentStep < totalSteps - 1) { setDirection(1); setCurrentStep(s => s + 1); }
  }

  function goBack() {
    if (currentStep > 0) { setDirection(-1); setCurrentStep(s => s - 1); }
  }

  const field = enabledFields[currentStep];
  const isLast = currentStep === totalSteps - 1;

  return (
    <div
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && status !== 'submitting') { e.preventDefault(); if (status === 'success') return; if (isLast) handleSubmit(); else goNext(); } }}
      tabIndex={-1}
    >
      {/* Progress bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 100, background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          animate={{ width: `${progress}%` }}
          transition={{ ease: 'easeOut', duration: 0.4 }}
          style={{ height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }}
        />
      </div>

      {/* Header */}
      <div style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>{config.title || 'Form'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{currentStep + 1} / {totalSteps}</span>
          {!account ? <ConnectButton instance={dAppKit} /> : <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: 'var(--accent-2)', fontFamily: 'var(--mono)' }}>{account.address.slice(0,6)}…{account.address.slice(-4)}</span>}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 640 }}>

          {status === 'success' ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '2px solid var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>✓</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>All done!</h2>
              <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.6 }}>Your response has been anchored on Sui.</p>
              {receipt?.txDigest && <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: '8px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, wordBreak: 'break-all' }}>Tx: {receipt.txDigest}</div>}
            </motion.div>
          ) : field ? (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={field.id}
                custom={direction}
                initial={{ opacity: 0, y: direction * 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: direction * -40 }}
                transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--accent-2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{currentStep + 1} →</div>
                <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8, lineHeight: 1.3, letterSpacing: '-0.02em' }}>
                  {field.label}{field.required && <span style={{ color: 'var(--accent-2)', marginLeft: 4 }}>*</span>}
                </h2>
                {field.description && <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.6 }}>{field.description}</p>}
                <div style={{ marginBottom: 24 }}>
                  <FieldInput
                    field={field}
                    value={data[field.id] ?? (field.type === 'checkbox' && field.options ? [] : '')}
                    onChange={v => { setData(d => ({ ...d, [field.id]: v })); setErrors(e => { const n = {...e}; delete n[field.id]; return n; }); }}
                    onFile={files => handleFile(field.id, files)}
                    uploading={!!fileUploading[field.id]}
                  />
                </div>
                {errors[field.id] && <p style={{ fontSize: 13, color: 'var(--error)', marginBottom: 16 }}>{errors[field.id]}</p>}
                {errMsg && <div className="alert-error" style={{ marginBottom: 16 }}>{errMsg}</div>}
                {!account && isLast && (
                  <div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1 }}>Connect wallet to submit</span>
                    <ConnectButton instance={dAppKit} />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {isLast ? (
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={status === 'submitting' || !account} style={{ padding: '13px 28px', fontSize: 15 }}>
                      {status === 'submitting' ? <><span className="spinner" />Submitting…</> : '🛡️ Submit'}
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={goNext} style={{ padding: '13px 28px', fontSize: 15 }}>OK →</button>
                  )}
                  {currentStep > 0 && <button className="btn btn-secondary btn-sm" onClick={goBack} style={{ opacity: 0.6 }}>↑ Back</button>}
                  <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>press <kbd style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 5px', fontFamily: 'inherit' }}>Enter</kbd></span>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function FormPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)' }}>
        <span className="spinner" style={{ width: 20, height: 20 }} />Loading…
      </div>
    }>
      <FormPageContent />
    </Suspense>
  );
}

