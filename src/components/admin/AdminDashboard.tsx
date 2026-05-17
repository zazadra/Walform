"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { getOwnedForms, getOwnedSubmissions, getFormByObjectId, updateSubmissionStatus, updateSubmissionNote } from '@/lib/walrus-onchain';
import { FormConfig, Submission } from '@/types/walform';
import { motion, AnimatePresence } from 'framer-motion';
import { decryptWithSeal, decryptData } from '@/lib/seal';
import { useIsMobile } from '@/hooks/useMediaQuery';

function MediaPreview({ url, type = 'auto' }: { url: string, type?: 'auto' | 'image' | 'video' }) {
  // Enhanced detection for media
  const isImage = type === 'image' || 
                  url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)/i) || 
                  url.startsWith('data:image') ||
                  (url.includes('walrus.space') && !url.match(/\.(mp4|webm|ogg|mov|avi)/i)); // Default walrus blobs to image unless video ext found

  const isVideo = type === 'video' || 
                  url.match(/\.(mp4|webm|ogg|mov|avi|mkv)/i) || 
                  url.startsWith('data:video');
  
  if (isVideo) {
    return (
      <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)' }}>
        <video src={url} controls style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '450px' }} />
      </div>
    );
  }

  if (isImage) {
    return (
      <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)', position: 'relative', minHeight: 80 }}>
        <img 
          src={url} 
          alt="Preview" 
          style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '450px', objectFit: 'contain' }} 
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const parent = e.currentTarget.parentElement;
            if (parent && !parent.querySelector('.media-fallback')) {
              const div = document.createElement('div');
              div.className = 'media-fallback';
              div.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;gap:8px;color:var(--text-3);font-size:13px;';
              div.innerHTML = '<span style="font-size:28px">📄</span><span style="font-weight:600">Media file stored on Walrus</span><span style="font-size:11px;opacity:0.7">Use the download button below to access it</span>';
              parent.appendChild(div);
            }
          }}
        />
      </div>
    );
  }
  
  return null;
}

// ── Components ───────────────────────────────────────────────────

function SubmissionDetail({ sub, idx, config, onUpdateNote, onStatusChange, formId, isUserAdmin, decryptionSig, setDecryptionSig, decryptedPreloaded, onDecrypted }: { 
  sub: Submission; 
  idx: number;
  config: FormConfig | null;
  onUpdateNote: (id: string, note: string) => void;
  onStatusChange: (id: string, status: string) => void;
  formId: string;
  isUserAdmin: boolean;
  decryptionSig: string | null;
  setDecryptionSig: (sig: string | null) => void;
  decryptedPreloaded?: any;
  onDecrypted?: (id: string, data: any) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<'content' | 'meta'>('content');
  const [decryptedData, setDecryptedData] = useState<any>(null);
  const [decryptErr, setDecryptErr] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [note, setNote] = useState(sub.note || '');

  useEffect(() => { setNote(sub.note || ''); setDecryptedData(null); setDecryptErr(false); }, [sub.id]);

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
    if (sub.data?.__encrypted && decryptionSig && config && !decryptedPreloaded) {
      const promise = config.sealedPrivateKey 
        ? decryptWithSeal(sub.data.__encrypted as string, config.sealedPrivateKey, decryptionSig)
        : (decryptData as any)(sub.data.__encrypted as string, `walform:${config.publishedBy || (config.admins && config.admins[0]) || ''}:${formId}`);

      promise
        .then((dec: string) => {
          const parsed = JSON.parse(dec);
          setDecryptedData(parsed);
          setDecryptErr(false);
          if (onDecrypted) onDecrypted(sub.id, parsed);
        })
        .catch((err: any) => {
          console.error("[Decrypt] Error:", err);
          setDecryptErr(true);
        });
    }
  }, [sub.data, decryptionSig, config, formId, decryptedPreloaded]);

  const displayData = sub.data?.__encrypted ? (decryptedPreloaded || decryptedData || {}) : sub.data;

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
      <div style={{ 
        padding: isMobile ? '72px 16px 24px' : '24px 32px', 
        borderBottom: '1px solid var(--border)', 
        background: 'rgba(255,255,255,0.01)', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexShrink: 0 
      }}>
        <div>
          <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, letterSpacing: '-0.02em' }}>Submission #{idx + 1}</h2>
          <p className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{sub.id}</p>
        </div>
        <div className="tab-pill">
          <button className={`tab-pill-btn ${activeTab === 'content' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setActiveTab('content'); }}>Content</button>
          <button className={`tab-pill-btn ${activeTab === 'meta' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setActiveTab('meta'); }}>Metadata</button>
        </div>
      </div>

      {/* Status Action Bar - always visible at top */}
      <div style={{ padding: '10px 32px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)', display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', flexShrink: 0 }}>STATUS</span>
        {['new', 'reviewing', 'done', 'rejected'].map(s => (
          <button key={s} onClick={(e) => { e.stopPropagation(); onStatusChange(sub.id, s); }} className={`btn btn-sm ${sub.status === s ? 'btn-primary' : 'btn-secondary'}`} style={{ textTransform: 'uppercase', fontSize: '11px', padding: '5px 12px', flex: '1 1 auto', minWidth: '80px' }}>{s}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 32 }}>
        {activeTab === 'content' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px 20px', background: 'rgba(13,148,136,0.03)', borderRadius: 12, border: '1px solid rgba(13,148,136,0.1)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Submitter</label>
                <p className="mono" style={{ fontSize: 12, color: 'var(--text-1)', wordBreak: 'break-all' }}>{sub.submitterAddress}</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Timestamp</label>
                <p style={{ fontSize: 12, color: 'var(--text-1)' }}>{new Date(sub.timestamp).toLocaleString()}</p>
              </div>
            </div>

            {sub.data?.__encrypted && !decryptedPreloaded && !decryptedData && (
              <div className="card-premium" style={{ padding: 32, textAlign: 'center', border: '1px dashed var(--accent-1-alpha)' }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Encrypted Content</h3>
                
                {decryptionSig && !decryptErr ? (
                  <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>Decrypting submission data...</p>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>Unlock with your wallet signature to view.</p>
                    <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); onUnlock(); }} disabled={unlocking}>
                      {unlocking ? 'Unlocking...' : 'Unlock Submission'}
                    </button>
                    {decryptErr && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 12 }}>Decryption failed. Check wallet.</p>}
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {config?.fields.filter(f => f.enabled).map(f => {
                const val = displayData[f.id];
                return (
                  <div key={f.id}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>{f.label}</label>
                    <div style={{ fontSize: 14, color: 'var(--text-1)', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)', wordBreak: 'break-word' }}>
                      {!val ? (
                        <span style={{ color: 'var(--text-4)', fontStyle: 'italic' }}>No answer</span>
                      ) : f.type === 'file' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                           {(Array.isArray(val) ? val : [val]).map((blobObj: any, i: number) => {
                             const idStr = typeof blobObj === 'string' ? blobObj : blobObj?.blobId;
                             if (!idStr) return <div key={i}>Invalid media format</div>;
                             return (
                               <div key={idStr} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                                 <MediaPreview url={`https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${idStr}`} />
                                 <div style={{ display: 'flex', gap: 8 }}>
                                   <a href={`https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${idStr}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }} onClick={e => e.stopPropagation()}>
                                     📥 Download File
                                   </a>
                                 </div>
                                </div>
                             );
                           })}
                        </div>
                      ) : (f.type === 'url' || (typeof val === 'string' && val.startsWith('http'))) ? (
                        val.startsWith('http') ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <a 
                              href={val} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="link-premium" 
                              style={{ 
                                color: 'var(--accent-2)', 
                                textDecoration: 'underline', 
                                fontWeight: 600,
                                wordBreak: 'break-all',
                                fontSize: '13px',
                                position: 'relative',
                                zIndex: 10
                              }} 
                              onClick={(e) => e.stopPropagation()}
                            >
                              {val}
                            </a>
                            <MediaPreview url={val} />
                          </div>
                        ) : (
                          <div style={{ color: 'var(--text-1)', fontSize: '15px', fontWeight: 500, lineHeight: 1.5, wordBreak: 'break-word' }}>{val}</div>
                        )
                      ) : (
                        <span>{val}</span>
                      )}
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
                  onClick={e => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="card-premium mono" style={{ padding: 24, fontSize: 12, color: 'var(--text-2)', overflowX: 'auto' }}>
            <pre>{JSON.stringify({ ...sub, data: displayData }, null, 2)}</pre>
          </div>
        )}
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
  const [decryptionSig, setDecryptionSig] = useState<string | null>(null);
  const [decryptedDataMap, setDecryptedDataMap] = useState<Record<string, any>>({});
  const [toast, setToast] = useState<{message: string, visible: boolean, type: 'success' | 'error'}>({ message: '', visible: false, type: 'success' });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // Handle mobile view switching
  useEffect(() => {
    if (selectedSubId) setMobileView('detail');
  }, [selectedSubId]);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ message: msg, visible: true, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  }

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
    if (selectedFormId && account) {
      const savedSig = localStorage.getItem(`walform_sig_${account.address}_${selectedFormId}`);
      setDecryptionSig(savedSig || null);
      setDecryptedDataMap({});
      loadSubs(selectedFormId, account.address);
    }
  }, [selectedFormId, account]);

  function handleSetDecryptionSig(sig: string | null) {
    setDecryptionSig(sig);
    if (account && selectedFormId) {
      if (sig) {
        localStorage.setItem(`walform_sig_${account.address}_${selectedFormId}`, sig);
      } else {
        localStorage.removeItem(`walform_sig_${account.address}_${selectedFormId}`);
      }
    }
  }

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
    setOpenByIdError('');
    try {
      const obj = await getFormByObjectId(id);
      if (!obj) throw new Error('Form not found');
      const cfg = JSON.parse(obj.configJson);
      const acc = account?.address.toLowerCase() ?? '';
      // Case-insensitive: admins[] stored lowercase at publish, wallet address may differ in casing
      const chainAdmins = (cfg.admins || []).map((a: string) => a.toLowerCase());
      const isOwner = account && ((obj.owner ?? '').toLowerCase() === acc || chainAdmins.includes(acc));
      // Encryption OFF → form is public, any wallet can open it
      // Encryption ON → only wallets in cfg.admins[] (saved on-chain at publish) can open it
      if (cfg.encryptionEnabled !== false && !isOwner) throw new Error('Not authorized');
      setForms(prev => prev.some(f => f.suiObjectId === id) ? prev : [{ ...obj, suiObjectId: id, title: cfg.title }, ...prev]);
      setSelectedFormId(id);
    } catch (e: any) { setOpenByIdError(e.message); }
    finally { setOpenByIdLoading(false); }
  }


  function handleStatusChange(id: string, s: string) {
    setSubs(prev => prev.map(x => x.id === id ? { ...x, status: s } : x));
    updateSubmissionStatus(id, s).catch(console.error);
  }

  // Unified Decryption Loop
  useEffect(() => {
    if (subs.length > 0 && decryptionSig && selectedFormId) {
      const formObj = forms.find(f => f.suiObjectId === selectedFormId);
      if (!formObj) return;
      let config: any;
      try { config = JSON.parse(formObj.configJson); } catch { return; }
      
      const toDecrypt = subs.filter(s => s.data?.__encrypted && !decryptedDataMap[s.id]);
      if (toDecrypt.length === 0) return;

      Promise.all(toDecrypt.map(async sub => {
        try {
          const dec = config.sealedPrivateKey 
            ? await decryptWithSeal(sub.data.__encrypted as string, config.sealedPrivateKey, decryptionSig)
            : await (decryptData as any)(sub.data.__encrypted as string, `walform:${config.publishedBy || (config.admins && config.admins[0]) || ''}:${selectedFormId}`);
          return { id: sub.id, data: JSON.parse(dec) };
        } catch (e) {
          console.error("[Decrypt Loop] Error for", sub.id, e);
          return { id: sub.id, data: null };
        }
      })).then(results => {
        setDecryptedDataMap(prev => {
          const next = { ...prev };
          let changed = false;
          for (const res of results) {
            if (res.data) {
              next[res.id] = res.data;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      });
    }
  }, [subs, decryptionSig, selectedFormId, forms]);

  function handleUpdateNote(id: string, n: string) {
    setSubs(prev => prev.map(x => x.id === id ? { ...x, note: n } : x));
    updateSubmissionNote(id, n).catch(console.error);
  }

  function exportData(type: 'csv' | 'json') {
    if (filteredSubs.length === 0) return;
    
    const exportSubs = filteredSubs.map(s => ({
      ...s,
      data: decryptedDataMap[s.id] || s.data
    }));

    if (type === 'json') {
      const blob = new Blob([JSON.stringify(exportSubs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `walform_export_${Date.now()}.json`; a.click();
    } else {
      const fields = parsedFormConfig?.fields.filter(f => f.enabled) || [];
      const headers = ['ID', 'Timestamp', 'Submitter', 'Status', ...fields.map(f => f.label)];
      const rows = exportSubs.map(s => [
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
    // Encryption OFF → form data is plaintext, any connected wallet can view responses
    if (parsedFormConfig.encryptionEnabled === false) return true;
    // Encryption ON → only the Sui object owner or wallets in cfg.admins[] (on-chain)
    const acc = account.address.toLowerCase();
    const chainAdmins = (parsedFormConfig.admins || []).map((a: string) => a.toLowerCase());
    const owner1 = ((selectedForm as any).owner || '').toLowerCase();
    const owner2 = (parsedFormConfig.publishedBy || '').toLowerCase();
    return chainAdmins.includes(acc) || owner1 === acc || owner2 === acc;
  }, [selectedForm, account, parsedFormConfig]);

  const stats = {
    new: isAdmin ? subs.filter(s => s.status === 'new' || !s.status).length : 0,
    reviewing: isAdmin ? subs.filter(s => s.status === 'reviewing').length : 0,
    done: isAdmin ? subs.filter(s => s.status === 'done').length : 0,
    rejected: isAdmin ? subs.filter(s => s.status === 'rejected').length : 0
  };

  const selectedSub = subs.find(s => s.id === selectedSubId);
  const selectedSubIdx = subs.findIndex(s => s.id === selectedSubId);

  const filteredSubs = useMemo(() => {
    if (!statusFilter) return subs;
    return subs.filter(s => (s.status || 'new') === statusFilter);
  }, [subs, statusFilter]);

  if (!account) return <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ConnectButton instance={dAppKit} /></div>;

  return (
    <div className="dashboard-layout-root" style={{ 
      display: 'grid', 
      gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', 
      height: '100dvh', 
      background: 'var(--bg)', 
      overflow: 'hidden',
      position: 'relative'
    }}>
      <AnimatePresence>
        {toast.visible && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9, x: '-50%' }} 
            animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }} 
            exit={{ opacity: 0, y: 20, scale: 0.9, x: '-50%' }}
            style={{ 
              position: 'fixed', bottom: 40, left: '50%', zIndex: 10000,
              padding: '12px 24px', borderRadius: '16px', 
              background: toast.type === 'error' ? 'rgba(220, 38, 38, 0.95)' : 'rgba(13, 148, 136, 0.95)', 
              border: '1px solid rgba(255,255,255,0.2)', color: 'white',
              display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(10px)', fontWeight: 600
            }}
          >
            <span style={{ fontSize: 18 }}>{toast.type === 'error' ? '✕' : '✅'}</span>
            <span style={{ fontSize: 14 }}>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <aside style={{ 
        borderRight: '1px solid var(--border)', 
        padding: 24, 
        display: isMobile ? (mobileSidebarOpen ? 'flex' : 'none') : 'flex', 
        flexDirection: 'column', 
        gap: 24, 
        overflow: 'hidden',
        position: isMobile ? 'fixed' : 'relative',
        top: 0, left: 0, bottom: 0, width: 280,
        background: 'var(--bg)',
        zIndex: 1000,
        boxShadow: isMobile ? '20px 0 50px rgba(0,0,0,0.5)' : 'none'
      }}>
        {isMobile && (
          <button onClick={() => setMobileSidebarOpen(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 20 }}>✕</button>
        )}
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
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
                <button key={f.suiObjectId} onClick={() => { setSelectedFormId(f.suiObjectId); if(isMobile) setMobileSidebarOpen(false); }} className={`sidebar-link ${selectedFormId === f.suiObjectId ? 'active' : ''}`} style={{ width: '100%', textAlign: 'left' }}>
                  {f.title || 'Untitled Form'}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {isMobile && mobileSidebarOpen && (
        <div onClick={() => setMobileSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, backdropFilter: 'blur(4px)' }} />
      )}

      <main style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr' : '340px 1fr', 
        height: '100%', 
        overflow: 'hidden' 
      }}>
        <section style={{ 
          borderRight: '1px solid var(--border)', 
          display: isMobile ? (mobileView === 'list' ? 'flex' : 'none') : 'flex', 
          flexDirection: 'column', 
          height: '100%', 
          overflow: 'hidden' 
        }}>
          <div style={{ padding: isMobile ? '16px' : '24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {isMobile && (
                  <button onClick={() => setMobileSidebarOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--text-1)', fontSize: 20, padding: 0 }}>☰</button>
                )}
                <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 900 }}>Responses</h2>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => exportData('csv')} title="Download CSV">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  CSV
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => exportData('json')} title="Download JSON">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  JSON
                </button>
              </div>
            </div>
            {/* Status Grid Refinement */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: isMobile ? 4 : 8, marginBottom: 16 }}>
              <div 
                onClick={() => setStatusFilter(statusFilter === 'new' ? null : 'new')}
                style={{ cursor: 'pointer', textAlign: 'center', background: statusFilter === 'new' ? 'rgba(13,148,136,0.1)' : 'rgba(255,255,255,0.03)', padding: isMobile ? '6px 2px' : '10px 8px', borderRadius: 12, border: statusFilter === 'new' ? '1px solid var(--accent)' : '1px solid var(--border)', minWidth: 0, transition: 'all 0.2s' }}
              >
                <p style={{ fontSize: isMobile ? 7 : 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em' }}>NEW</p>
                <p style={{ fontSize: isMobile ? 16 : 20, fontWeight: 900, color: 'var(--accent-2)' }}>{stats.new}</p>
              </div>
              <div 
                onClick={() => setStatusFilter(statusFilter === 'reviewing' ? null : 'reviewing')}
                style={{ cursor: 'pointer', textAlign: 'center', background: statusFilter === 'reviewing' ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)', padding: isMobile ? '6px 2px' : '10px 8px', borderRadius: 12, border: statusFilter === 'reviewing' ? '1px solid #fbbf24' : '1px solid var(--border)', minWidth: 0, transition: 'all 0.2s' }}
              >
                <p style={{ fontSize: isMobile ? 7 : 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em' }}>REVIEWING</p>
                <p style={{ fontSize: isMobile ? 16 : 20, fontWeight: 900, color: statusFilter === 'reviewing' ? '#fbbf24' : 'var(--text-1)' }}>{stats.reviewing}</p>
              </div>
              <div 
                onClick={() => setStatusFilter(statusFilter === 'done' ? null : 'done')}
                style={{ cursor: 'pointer', textAlign: 'center', background: statusFilter === 'done' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)', padding: isMobile ? '6px 2px' : '10px 8px', borderRadius: 12, border: statusFilter === 'done' ? '1px solid #10b981' : '1px solid var(--border)', minWidth: 0, transition: 'all 0.2s' }}
              >
                <p style={{ fontSize: isMobile ? 7 : 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em' }}>DONE</p>
                <p style={{ fontSize: isMobile ? 16 : 20, fontWeight: 900, color: '#10b981' }}>{stats.done}</p>
              </div>
              <div 
                onClick={() => setStatusFilter(statusFilter === 'rejected' ? null : 'rejected')}
                style={{ cursor: 'pointer', textAlign: 'center', background: statusFilter === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)', padding: isMobile ? '6px 2px' : '10px 8px', borderRadius: 12, border: statusFilter === 'rejected' ? '1px solid #ef4444' : '1px solid rgba(239,68,68,0.2)', minWidth: 0, transition: 'all 0.2s' }}
              >
                <p style={{ fontSize: isMobile ? 7 : 9, fontWeight: 800, color: 'var(--error)', letterSpacing: '0.05em' }}>REJECTED</p>
                <p style={{ fontSize: isMobile ? 16 : 20, fontWeight: 900, color: 'var(--error)' }}>{stats.rejected}</p>
              </div>
            </div>
            {selectedForm && (
              <div style={{ padding: 8, background: 'rgba(13,148,136,0.05)', borderRadius: 8, border: '1px solid rgba(13,148,136,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--accent-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedForm.suiObjectId}>{selectedForm.formId} &middot; {selectedForm.suiObjectId.slice(0,6)}…{selectedForm.suiObjectId.slice(-4)}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => { navigator.clipboard.writeText(selectedForm.suiObjectId); showToast('✅ Object ID Copied to Clipboard'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }} title="Copy Sui Object ID">📋</button>
                  <a href={`/f?formId=${selectedForm.suiObjectId}`} target="_blank" rel="noreferrer" style={{ fontSize: 14 }} title="Open Form">🔗</a>
                </div>
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            {!isAdmin ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--error)', marginBottom: 6 }}>Access Denied</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 280, margin: '0 auto', lineHeight: 1.5 }}>
                  This form has Seal Encryption enabled. Only the form's admin wallet can view responses.
                </div>
              </div>
            ) : loading ? <div className="spinner" /> : filteredSubs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)' }}>No responses found.</div>
            ) : filteredSubs.map((s) => (
              <button 
                key={s.id} 
                onClick={() => {
                  setSelectedSubId(s.id);
                  if (isMobile) setMobileView('detail');
                }} 
                className={`sub-card-premium ${selectedSubId === s.id ? 'active' : ''}`} 
                style={{ width: '100%', textAlign: 'left', marginBottom: 8, padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: selectedSubId === s.id ? 'rgba(13,148,136,0.08)' : 'rgba(255,255,255,0.02)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)' }}>#{subs.length - subs.indexOf(s)}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: s.status === 'done' ? '#34d399' : s.status === 'rejected' ? '#ef4444' : s.status === 'reviewing' ? '#fbbf24' : '#60a5fa' }}>{s.status || 'new'}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="mono">
                  {s.submitterAddress ? `${s.submitterAddress.slice(0, 6)}...${s.submitterAddress.slice(-4)}` : 'Unknown'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-4)' }}>{new Date(s.timestamp).toLocaleDateString()}</div>
              </button>
            ))}
          </div>
        </section>

        <section style={{ 
          height: '100%', 
          overflow: 'hidden', 
          display: isMobile ? (mobileView === 'detail' ? 'flex' : 'none') : 'flex', 
          flexDirection: 'column',
          position: 'relative'
        }}>
          {isMobile && mobileView === 'detail' && (
            <button 
              onClick={() => { setMobileView('list'); setSelectedSubId(null); }} 
              style={{ 
                position: 'absolute', top: 20, left: 16, zIndex: 20,
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', 
                borderRadius: '50px', padding: '6px 16px', color: 'var(--text-1)', fontSize: 12, fontWeight: 800,
                backdropFilter: 'blur(8px)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}
            >
              ← Back
            </button>
          )}
          {selectedSub ? (
            <SubmissionDetail 
              sub={selectedSub} 
              idx={selectedSubIdx} 
              config={parsedFormConfig} 
              onUpdateNote={handleUpdateNote} 
              onStatusChange={handleStatusChange} 
              formId={selectedFormId!} 
              isUserAdmin={isAdmin} 
              decryptionSig={decryptionSig} 
              setDecryptionSig={handleSetDecryptionSig} 
              decryptedPreloaded={decryptedDataMap[selectedSub.id]}
              onDecrypted={(id, data) => setDecryptedDataMap(prev => ({ ...prev, [id]: data }))}
              onShowToast={showToast}
            />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)' }}>Select a response to view details</div>
          )}
        </section>
      </main>

      <style jsx global>{`
        .sidebar-link { padding: 10px 14px; border-radius: 8px; font-size: 13px; color: var(--text-2); transition: all 0.2s; border: 1px solid transparent; }
        .sidebar-link:hover { background: rgba(255,255,255,0.04); }
        .sidebar-link.active { background: rgba(13,148,136,0.1); color: var(--text-1); border-color: rgba(13,148,136,0.3); }
        .tab-pill { background: rgba(255,255,255,0.05); padding: 4px; border-radius: 10px; display: flex; }
        .tab-pill-btn { border: none; background: none; padding: 6px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--text-3); cursor: pointer; }
        .tab-pill-btn.active { background: var(--accent); color: white; box-shadow: var(--glow-sm); }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

