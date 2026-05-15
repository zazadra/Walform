"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { getOwnedForms, getOwnedSubmissions, getFormByObjectId, updateSubmissionStatus, updateSubmissionNote } from '@/lib/walrus-onchain';
import { FormConfig, Submission } from '@/types/walform';
import { decryptWithSeal, decryptData } from '@/lib/seal';

// ── Components ───────────────────────────────────────────────────

function SubmissionDetail({ sub, idx, config, onUpdateNote, onStatusChange, formId, isUserAdmin }: { 
  sub: Submission; 
  idx: number;
  config: FormConfig | null;
  onUpdateNote: (id: string, note: string) => void;
  onStatusChange: (id: string, status: string) => void;
  formId: string;
  isUserAdmin: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'content' | 'meta'>('content');
  const [decryptedData, setDecryptedData] = useState<any>(null);
  const [decryptErr, setDecryptErr] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [decryptionSig, setDecryptionSig] = useState<string | null>(null);
  const [note, setNote] = useState(sub.note || '');

  useEffect(() => { setNote(sub.note || ''); setDecryptedData(null); setDecryptionSig(null); setDecryptErr(false); }, [sub.id]);

  async function onUnlock() {
    try {
      setUnlocking(true);
      const msg = `Walform Security Seal\nForm ID: ${config?.id}\n\nSign this message to authorize encryption/decryption.`;
      const { signature } = await dAppKit.signPersonalMessage({ message: new TextEncoder().encode(msg) });
      setDecryptionSig(signature);
    } catch (e) {
      console.error("[Unlock] Failed:", e);
    } finally {
      setUnlocking(false);
    }
  }

  useEffect(() => {
    if (sub.data?.__encrypted && decryptionSig && config) {
      const promise = config.sealedPrivateKey 
        ? decryptWithSeal(sub.data.__encrypted as string, config.sealedPrivateKey, decryptionSig)
        : (decryptData as any)(sub.data.__encrypted as string, `walform:${config.publishedBy || (config.admins && config.admins[0]) || ''}:${formId}`);

      promise
        .then((dec: string) => {
          setDecryptedData(JSON.parse(dec));
          setDecryptErr(false);
        })
        .catch((err: any) => {
          console.error("[Decrypt] Error:", err);
          setDecryptErr(true);
        });
    }
  }, [sub.data, decryptionSig, config, formId]);

  const displayData = sub.data?.__encrypted ? (decryptedData || {}) : sub.data;

  if (!isUserAdmin) {
    return (
      <div className="card-premium" style={{ padding: 48, textAlign: 'center', border: '1px dashed var(--error)', background: 'rgba(239,68,68,0.02)' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--error)', marginBottom: 8 }}>Access Denied</h3>
        <p style={{ fontSize: 14, color: 'var(--text-2)' }}>You do not have permission to view this response.</p>
      </div>
    );
  }

  return (
    <div className="card-premium" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>Submission #{idx + 1}</h2>
          <p className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{sub.id}</p>
        </div>
        <div className="tab-pill">
          <button className={`tab-pill-btn ${activeTab === 'content' ? 'active' : ''}`} onClick={() => setActiveTab('content')}>Content</button>
          <button className={`tab-pill-btn ${activeTab === 'meta' ? 'active' : ''}`} onClick={() => setActiveTab('meta')}>Metadata</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 32 }}>
        {activeTab === 'content' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px 20px', background: 'rgba(139,92,246,0.03)', borderRadius: 12, border: '1px solid rgba(139,92,246,0.1)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Submitter</label>
                <p className="mono" style={{ fontSize: 12, color: 'var(--text-1)', wordBreak: 'break-all' }}>{sub.submitterAddress || 'Anonymous'}</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Timestamp</label>
                <p style={{ fontSize: 12, color: 'var(--text-1)' }}>{new Date(sub.timestamp).toLocaleString()}</p>
              </div>
            </div>

            {sub.data?.__encrypted && !decryptedData && (
              <div className="card-premium" style={{ padding: 32, textAlign: 'center', border: '1px dashed var(--accent-1-alpha)' }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Encrypted Content</h3>
                <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>Unlock with your wallet signature to view.</p>
                <button className="btn btn-primary" onClick={onUnlock} disabled={unlocking}>
                  {unlocking ? 'Unlocking...' : 'Unlock Submission'}
                </button>
                {decryptErr && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 12 }}>Decryption failed. Check wallet.</p>}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {config?.fields.filter(f => f.enabled).map(f => {
                const val = displayData[f.id];
                return (
                  <div key={f.id}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>{f.label}</label>
                    <div style={{ fontSize: 14, color: 'var(--text-1)', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      {!val && <span style={{ color: 'var(--text-4)', fontStyle: 'italic' }}>No answer</span>}
                      {f.type === 'file' && val ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                           {(Array.isArray(val) ? val : [val]).map((blobId: string) => (
                             <div key={blobId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                               <div style={{ position: 'relative' }}>
                                 <img 
                                   src={`https://aggregator.walrus-testnet.walrus.site/v1/blobs/${blobId}`} 
                                   alt="Preview" 
                                   style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 10, border: '1px solid var(--border)', display: 'block' }} 
                                   onLoad={(e) => { (e.target as any).nextSibling.style.display = 'none'; }}
                                   onError={(e) => { (e.target as any).style.display = 'none'; (e.target as any).nextSibling.style.display = 'flex'; }}
                                 />
                                 <div style={{ display: 'none', height: 120, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                                   <div style={{ fontSize: 24 }}>📄</div>
                                   <div style={{ fontSize: 11, color: 'var(--text-3)' }}>File (Non-Image)</div>
                                 </div>
                               </div>
                               <div style={{ display: 'flex', gap: 8 }}>
                                 <a href={`https://aggregator.walrus-testnet.walrus.site/v1/blobs/${blobId}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Download File</a>
                               </div>
                             </div>
                           ))}
                        </div>
                      ) : val}
                    </div>
                  </div>
                );
              })}

              <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>INTERNAL NOTE</label>
                <textarea 
                  className="textarea" 
                  value={note} 
                  onChange={e => { setNote(e.target.value); onUpdateNote(sub.id, e.target.value); }}
                  placeholder="Private notes for team members..."
                  style={{ minHeight: 120, fontSize: 13 }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="card-premium mono" style={{ padding: 24, fontSize: 12, color: 'var(--text-2)' }}>
            <pre>{JSON.stringify({ ...sub, data: undefined }, null, 2)}</pre>
          </div>
        )}
      </div>

      <div style={{ padding: '20px 32px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)', display: 'flex', gap: 12 }}>
        {['new', 'reviewing', 'done', 'rejected'].map(s => (
          <button key={s} onClick={() => onStatusChange(sub.id, s)} className={`btn btn-sm ${sub.status === s ? 'btn-primary' : 'btn-secondary'}`} style={{ textTransform: 'capitalize' }}>{s}</button>
        ))}
      </div>
    </div>
  );
}

// ── AdminDashboard ───────────────────────────────────────────────

export default function AdminDashboard() {
  const account = useCurrentAccount();
  const [forms, setForms] = useState<any[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formsLoading, setFormsLoading] = useState(false);
  const [openByIdInput, setOpenByIdInput] = useState('');
  const [openByIdError, setOpenByIdError] = useState('');
  const [openByIdLoading, setOpenByIdLoading] = useState(false);

  useEffect(() => {
    if (!account) return;
    setFormsLoading(true);
    getOwnedForms(account.address).then(f => {
      const enriched = f.map(x => { try { return { ...x, title: JSON.parse(x.configJson).title }; } catch { return x; } });
      setForms(enriched);
      if (enriched.length > 0 && !selectedFormId) setSelectedFormId(enriched[0].suiObjectId);
    }).finally(() => setFormsLoading(false));
  }, [account]);

  useEffect(() => {
    if (selectedFormId && account) loadSubs(selectedFormId, account.address);
  }, [selectedFormId, account]);

  async function loadSubs(id: string, owner: string) {
    setLoading(true);
    try {
      const res = await getOwnedSubmissions(owner, id);
      setSubs(res.map(r => {
        const parsed = JSON.parse(r.payloadJson);
        return {
          id: r.suiObjectId,
          formId: r.formId,
          formBlobId: parsed.formBlobId || '',
          submitterAddress: r.submitter,
          timestamp: r.timestamp,
          data: parsed.data,
          status: r.status,
          note: r.note || ''
        };
      }));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleOpenById() {
    const id = openByIdInput.trim();
    if (!id.startsWith('0x')) return setOpenByIdError('Invalid Sui ID');
    setOpenByIdLoading(true);
    try {
      const obj = await getFormByObjectId(id);
      if (!obj) throw new Error('Form not found');
      const cfg = JSON.parse(obj.configJson);
      const isOwner = account && (obj.owner === account.address || (cfg.admins || []).includes(account.address));
      if (!isOwner) throw new Error('Not authorized');
      setForms(prev => prev.some(f => f.suiObjectId === id) ? prev : [{ ...obj, title: cfg.title }, ...prev]);
      setSelectedFormId(id);
    } catch (e: any) { setOpenByIdError(e.message); }
    finally { setOpenByIdLoading(false); }
  }

  function handleStatusChange(id: string, s: string) {
    setSubs(prev => prev.map(x => x.id === id ? { ...x, status: s } : x));
    updateSubmissionStatus(id, s).catch(console.error);
  }

  function handleUpdateNote(id: string, n: string) {
    setSubs(prev => prev.map(x => x.id === id ? { ...x, note: n } : x));
    updateSubmissionNote(id, n).catch(console.error);
  }

  function exportData(type: 'csv' | 'json') {
    if (subs.length === 0) return;
    if (type === 'json') {
      const blob = new Blob([JSON.stringify(subs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `walform_export_${Date.now()}.json`; a.click();
    } else {
      const fields = parsedFormConfig?.fields.filter(f => f.enabled) || [];
      const headers = ['ID', 'Timestamp', 'Submitter', 'Status', ...fields.map(f => f.label)];
      const rows = subs.map(s => [
        s.id,
        new Date(s.timestamp).toISOString(),
        s.submitterAddress,
        s.status,
        ...fields.map(f => {
          const val = s.data[f.id];
          return Array.isArray(val) ? val.join('; ') : (val || '');
        })
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `walform_export_${Date.now()}.csv`; a.click();
    }
  }

  const selectedForm = forms.find(f => f.suiObjectId === selectedFormId);
  const parsedFormConfig = useMemo(() => {
    if (!selectedForm) return null;
    try { return JSON.parse(selectedForm.configJson) as FormConfig; } catch { return null; }
  }, [selectedForm]);

  const isAdmin = useMemo(() => {
    if (!selectedForm || !account || !parsedFormConfig) return false;
    const acc = account.address.toLowerCase();
    const admins = (parsedFormConfig.admins || []).map(a => a.toLowerCase());
    const owner1 = ((selectedForm as any).owner || '').toLowerCase();
    const owner2 = (parsedFormConfig.publishedBy || '').toLowerCase();
    return admins.includes(acc) || owner1 === acc || owner2 === acc;
  }, [selectedForm, account, parsedFormConfig]);

  const stats = {
    new: subs.filter(s => s.status === 'new' || !s.status).length,
    reviewing: subs.filter(s => s.status === 'reviewing').length,
    done: subs.filter(s => s.status === 'done').length,
    rejected: subs.filter(s => s.status === 'rejected').length
  };

  const selectedSub = subs.find(s => s.id === selectedSubId);
  const selectedSubIdx = subs.findIndex(s => s.id === selectedSubId);

  if (!account) return <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ConnectButton instance={dAppKit} /></div>;

  return (
    <div className="dashboard-layout-root" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: '100dvh', background: 'var(--bg)' }}>
      <aside style={{ borderRight: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', marginBottom: 8, display: 'block' }}>OPEN BY ID</label>
          <input className="input" placeholder="0x..." value={openByIdInput} onChange={e => setOpenByIdInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleOpenById()} style={{ fontSize: 12, marginBottom: 8 }} />
          <button className="btn btn-secondary btn-sm" onClick={handleOpenById} style={{ width: '100%' }}>{openByIdLoading ? 'Loading...' : 'Open Form'}</button>
          {openByIdError && <p style={{ color: 'var(--error)', fontSize: 10, marginTop: 4 }}>{openByIdError}</p>}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', marginBottom: 12, display: 'block' }}>MY FORMS</label>
          {formsLoading ? <div className="spinner" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {forms.map(f => (
                <button key={f.suiObjectId} onClick={() => setSelectedFormId(f.suiObjectId)} className={`sidebar-link ${selectedFormId === f.suiObjectId ? 'active' : ''}`} style={{ width: '100%', textAlign: 'left' }}>
                  {f.title || 'Untitled Form'}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main style={{ display: 'grid', gridTemplateColumns: '340px 1fr', overflow: 'hidden' }}>
        <section style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 900 }}>Responses</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => exportData('csv')}>CSV</button>
                <button className="btn btn-secondary btn-sm" onClick={() => exportData('json')}>JSON</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)' }}>NEW</p>
                <p style={{ fontSize: 16, fontWeight: 900 }}>{stats.new}</p>
              </div>
              <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)' }}>PENDING</p>
                <p style={{ fontSize: 16, fontWeight: 900 }}>{stats.reviewing}</p>
              </div>
              <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)' }}>DONE</p>
                <p style={{ fontSize: 16, fontWeight: 900 }}>{stats.done}</p>
              </div>
              <div style={{ textAlign: 'center', background: 'rgba(239,68,68,0.05)', padding: 8, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--error)' }}>REJECTED</p>
                <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--error)' }}>{stats.rejected}</p>
              </div>
            </div>
            {selectedForm && (
              <div style={{ padding: 8, background: 'rgba(139,92,246,0.05)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--accent-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedForm.formId}</span>
                <a href={`/f?id=${selectedForm.formId}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>🔗</a>
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            {loading ? <div className="spinner" /> : subs.map((s, i) => (
              <button key={s.id} onClick={() => setSelectedSubId(s.id)} className={`sub-card-premium ${selectedSubId === s.id ? 'active' : ''}`} style={{ width: '100%', textAlign: 'left', marginBottom: 8, padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: selectedSubId === s.id ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)' }}>#{subs.length - i}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: s.status === 'done' ? '#34d399' : s.status === 'rejected' ? '#ef4444' : s.status === 'reviewing' ? '#fbbf24' : '#60a5fa' }}>{s.status || 'new'}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.submitterAddress || 'Anonymous'}</div>
                <div style={{ fontSize: 10, color: 'var(--text-4)' }}>{new Date(s.timestamp).toLocaleDateString()}</div>
              </button>
            ))}
          </div>
        </section>

        <section style={{ height: '100%', overflow: 'hidden' }}>
          {selectedSub ? (
            <SubmissionDetail sub={selectedSub} idx={selectedSubIdx} config={parsedFormConfig} onUpdateNote={handleUpdateNote} onStatusChange={handleStatusChange} formId={selectedFormId!} isUserAdmin={isAdmin} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)' }}>Select a response to view details</div>
          )}
        </section>
      </main>

      <style jsx global>{`
        .sidebar-link { padding: 10px 14px; border-radius: 8px; font-size: 13px; color: var(--text-2); transition: all 0.2s; border: 1px solid transparent; }
        .sidebar-link:hover { background: rgba(255,255,255,0.04); }
        .sidebar-link.active { background: rgba(139,92,246,0.1); color: var(--text-1); border-color: rgba(139,92,246,0.3); }
        .tab-pill { background: rgba(255,255,255,0.05); padding: 4px; border-radius: 10px; display: flex; }
        .tab-pill-btn { border: none; background: none; padding: 6px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--text-3); cursor: pointer; }
        .tab-pill-btn.active { background: var(--accent-1); color: white; box-shadow: var(--glow-sm); }
      `}</style>
    </div>
  );
}
