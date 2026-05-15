'use client';
import { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount, useCurrentWallet, useDAppKit } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { readJsonFromWalrus } from '@/lib/walrus';
import { getOwnedForms, getOwnedSubmissions, getFormByObjectId } from '@/lib/walrus-onchain';
import type { FormConfig, Submission } from '@/types/walform';
import { loadAdminConfig, saveAdminConfig, DEFAULT_CONFIG } from '@/lib/fields';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';


function shorten(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }
function shortId(id: string) { return `${id.slice(0, 8)}…${id.slice(-4)}`; }
function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function exportCSV(subs: Submission[]) {
  if (!subs.length) return;
  const dataKeys = [...new Set(subs.flatMap(s => Object.keys(s.data)))];
  const headers = ['ID', 'Timestamp', 'Submitter', 'Status', ...dataKeys];
  const esc = (v: any) => `"${String(Array.isArray(v) ? v.join('; ') : (v ?? '')).replace(/"/g, '""')}"`;
  const rows = [headers.map(h => `"${h}"`).join(','), ...subs.map(s => [`"${s.id}"`, `"${new Date(s.timestamp).toISOString()}"`, `"${s.submitterAddress || ''}"`, `"${s.status}"`, ...dataKeys.map(k => esc(s.data[k]))].join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' }));
  a.download = `walform-${Date.now()}.csv`;
  a.click();
}

function exportJSON(subs: Submission[]) {
  if (!subs.length) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(subs, null, 2)], { type: 'application/json' }));
  a.download = `walform-${Date.now()}.json`;
  a.click();
}

// ── Status badge ─────────────────────────────────────────────────
function StatusBadge({ status, onClick }: { status: string; onClick?: () => void }) {
  const map: Record<string, { bg: string; color: string }> = {
    new:      { bg: 'rgba(34,211,238,0.1)',  color: '#22d3ee' },
    open:     { bg: 'rgba(34,211,238,0.1)',  color: '#22d3ee' },
    pending:  { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24' },
    reviewing:{ bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24' },
    done:     { bg: 'rgba(74,222,128,0.1)',  color: '#4ade80' },
    approved: { bg: 'rgba(74,222,128,0.1)',  color: '#4ade80' },
    rejected: { bg: 'rgba(248,113,113,0.1)', color: '#f87171' },
  };
  const s = map[status] ?? { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-3)' };
  return (
    <span onClick={onClick} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: s.bg, color: s.color, cursor: onClick ? 'pointer' : 'default', textTransform: 'capitalize', border: `1px solid ${s.color}33` }}>
      {status || 'New'}
    </span>
  );
}

// ── Submission detail panel ───────────────────────────────────────
function SubmissionDetail({ sub, idx, onStatusChange, decryptionSig, onUnlock, unlocking, config, formId, onUpdateNote }: { 
  sub: Submission; 
  idx: number; 
  onStatusChange: (id: string, status: string) => void;
  decryptionSig: string | null;
  onUnlock: () => void;
  unlocking: boolean;
  config: FormConfig | null;
  formId: string;
  onUpdateNote: (id: string, note: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'content' | 'meta'>('content');
  const [decryptedData, setDecryptedData] = useState<Record<string, any> | null>(null);
  const [decryptErr, setDecryptErr] = useState(false);
  const [note, setNote] = useState(sub.adminNotes || '');

  useEffect(() => {
    setNote(sub.adminNotes || '');
  }, [sub.id]);

  useEffect(() => {
    if (sub.data?.__encrypted && decryptionSig && config) {
      import('@/lib/seal').then(({ decryptData }) => {
        // Derive the exact same key string as in f/page.tsx
        const adminAddress = config.publishedBy || (config.admins && config.admins[0]) || '';
        const encKey = `walform:${adminAddress}:${formId}`;
        
        decryptData(sub.data.__encrypted as string, encKey)
          .then((dec: string) => {
            setDecryptedData(JSON.parse(dec));
            setDecryptErr(false);
          })
          .catch((err) => {
            console.error("[Decrypt] Error:", err);
            setDecryptErr(true);
          });
      });
    } else {
      setDecryptedData(null);
    }
  }, [sub.data, decryptionSig, config, formId]);

  const displayData = sub.data?.__encrypted ? (decryptedData || {}) : sub.data;
  
  function onLookupWalrus(blobId: string) {
    window.open(`https://walruscan.com/testnet/blob/${blobId}`, '_blank');
  }

  return (
    <div className="card-premium" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
              Submission Details
            </h2>
            <p className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Response #{idx + 1} · {sub.id}
            </p>
          </div>
          <div className="tab-pill">
            <button className={`tab-pill-btn ${activeTab === 'content' ? 'active' : ''}`} onClick={() => setActiveTab('content')}>Content</button>
            <button className={`tab-pill-btn ${activeTab === 'meta' ? 'active' : ''}`} onClick={() => setActiveTab('meta')}>Metadata</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['new', 'reviewing', 'done', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => onStatusChange(sub.id, s)}
              className={`btn btn-sm ${sub.status === s ? 'btn-primary' : 'btn-secondary'}`}
              style={{ 
                fontSize: 11, fontWeight: 700, borderRadius: 8,
                boxShadow: sub.status === s ? 'var(--glow-sm)' : 'none',
                opacity: sub.status === s ? 1 : 0.6
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
        {activeTab === 'content' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {sub.data?.__encrypted && !decryptedData && (
              <div className="card-premium" style={{ padding: 32, textAlign: 'center', border: '1px dashed var(--accent-1-alpha)' }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Encrypted Content</h3>
                <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>This submission is encrypted. You need to unlock it with your wallet.</p>
                <button 
                  className="btn btn-primary" 
                  onClick={onUnlock}
                  disabled={unlocking}
                >
                  {unlocking ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} /> Unlocking...</> : 'Unlock Submission'}
                </button>
                {decryptErr && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 12 }}>Failed to decrypt. Make sure you are the form owner.</p>}
              </div>
            )}

            {/* Answer Display */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <label className="input-label" style={{ fontSize: 10, color: 'var(--text-3)' }}>SUBMITTER ADDRESS</label>
                <p className="mono" style={{ fontSize: 13, color: 'var(--accent-2)', wordBreak: 'break-all' }}>{sub.submitterAddress || 'Anonymous'}</p>
              </div>

              {config?.fields.filter(f => f.enabled).map(f => {
                const val = displayData[f.id];
                return (
                  <div key={f.id}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                      {f.label}
                    </label>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-1)', wordBreak: 'break-word', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      {!val && <span style={{ color: 'var(--text-4)', fontStyle: 'italic' }}>No answer</span>}
                      {f.type === 'file' && val ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {/* Media Preview */}
                          {(typeof val === 'string' && (val.match(/\.(jpg|jpeg|png|gif|webp)$/i) || val.startsWith('blob:'))) ? (
                            <img src={`https://publisher.walrus-testnet.walrus.site/v1/blobs/${val}`} alt="Preview" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)' }} onError={(e) => {
                              // If loading fails, fallback to simple ID
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}/>
                          ) : null}
                          <div className="mono" style={{ fontSize: 11, background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                            {val}
                          </div>
                          <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onLookupWalrus(val)}>
                            🔍 Lookup on Walrus
                          </button>
                        </div>
                      ) : Array.isArray(val) ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {val.map((v: any) => <span key={v} className="badge-premium" style={{ fontSize: 11 }}>{v}</span>)}
                        </div>
                      ) : (
                        val
                      )}
                    </div>
                  </div>
                );
              })}

              <div style={{ marginTop: 20 }}>
                <label className="input-label" style={{ fontSize: 10, color: 'var(--text-3)' }}>INTERNAL NOTE</label>
                <textarea 
                  className="textarea" 
                  placeholder="Private note..." 
                  value={note}
                  onChange={e => { setNote(e.target.value); onUpdateNote(sub.id, e.target.value); }}
                  style={{ fontSize: 13, background: 'rgba(0,0,0,0.2)', minHeight: 100 }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="card-premium" style={{ padding: 24 }}>
             <pre className="mono" style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
               {JSON.stringify({
                 id: sub.id,
                 submittedAt: new Date(sub.timestamp).toLocaleString(),
                 status: sub.status,
                 wallet: sub.submitterAddress || 'Anonymous',
                 blobId: sub.blobId,
                 suiObjectId: sub.suiObjectId
               }, null, 2)}
             </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Form selector sidebar ─────────────────────────────────────────
function FormSidebar({ forms, selectedId, onSelect, loading }: {
  forms: { suiObjectId: string; configJson: string; formId: string; createdAt: number; title?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {loading && (
        <div style={{ padding: '12px 14px', color: 'var(--text-3)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="spinner" style={{ width: 12, height: 12 }} />Loading forms…
        </div>
      )}
      {!loading && forms.length === 0 && (
        <div style={{ padding: '24px 12px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📭</div>
          No forms yet.<br />
          <a href="/builder" style={{ color: 'var(--accent-2)', textDecoration: 'none', fontWeight: 600 }}>Create one →</a>
        </div>
      )}
      {forms.map(f => (
        <button key={f.suiObjectId} onClick={() => onSelect(f.suiObjectId)}
          className={`sidebar-link ${selectedId === f.suiObjectId ? 'active' : ''}`}
          style={{ width: '100%', textAlign: 'left', background: undefined }}
        >
          <div style={{ width: 28, height: 28, borderRadius: 7, background: selectedId === f.suiObjectId ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>📝</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: selectedId === f.suiObjectId ? 'var(--text-1)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.title || 'Untitled Form'}
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{shortId(f.suiObjectId)}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function SubmissionList({ subs, selectedId, onSelect }: {
  subs: Submission[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {subs.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`sub-card-premium ${selectedId === s.id ? 'selected' : ''}`}
          style={{ 
            width: '100%', textAlign: 'left', padding: '14px 18px',
            borderLeft: `4px solid ${s.status === 'done' ? '#4ade80' : s.status === 'reviewing' ? '#fbbf24' : '#22d3ee'}`
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>
              {new Date(s.timestamp).toLocaleDateString()}
            </span>
            <div className="status-dot" style={{ 
              background: s.status === 'done' ? '#4ade80' : s.status === 'reviewing' ? '#fbbf24' : '#22d3ee',
              width: 6, height: 6
            }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: selectedId === s.id ? 'var(--text-1)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {Object.values(s.data)[0] || 'Empty Submission'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
             <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
               {s.status}
             </span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Main AdminDashboard ────────────────────────────────────────────
export function AdminDashboard() {
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const kit = useDAppKit();

  // Forms list
  const [forms, setForms] = useState<{ suiObjectId: string; configJson: string; formId: string; createdAt: number; title?: string }[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Submissions
  const [subs, setSubs] = useState<Submission[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState('');

  const [openByIdError, setOpenByIdError] = useState('');
  const [openByIdInput, setOpenByIdInput] = useState('');
  const [openByIdLoading, setOpenByIdLoading] = useState(false);
  
  // E2E Encryption state
  const [decryptionSig, setDecryptionSig] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  async function handleUnlock() {
    console.log("[Admin] handleUnlock triggered", { account });
    if (!account) {
      console.warn("[Admin] handleUnlock failed: account missing");
      return;
    }
    setUnlocking(true);
    try {
      const message = new TextEncoder().encode('Unlock Walform Submissions');
      console.log("[Admin] Requesting signature via dApp Kit action...");
      const result = await kit.signPersonalMessage({ message });
      
      if (!result.signature) throw new Error('Failed to get signature');
      console.log("[Admin] Signature received");
      setDecryptionSig(result.signature);
    } catch (e) {
      console.error('[Admin] Unlock error:', e);
      // Don't alert if user rejected
      if (!(e instanceof Error && (e.message.includes('reject') || e.message.includes('cancel')))) {
        alert('Unlock failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
      }
    }
    setUnlocking(false);
  }

  function handleUpdateNote(subId: string, note: string) {
    setSubs(prev => prev.map(s => s.id === subId ? { ...s, adminNotes: note } : s));
  }

  const [idCopied, setIdCopied] = useState(false);
  function copyId() {
    if (!selectedFormId) return;
    navigator.clipboard.writeText(selectedFormId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  }

  const stats = {
    new: subs.filter(s => s.status === 'new' || s.status === 'open' || !s.status).length,
    reviewing: subs.filter(s => s.status === 'reviewing' || s.status === 'pending').length,
    done: subs.filter(s => s.status === 'done' || s.status === 'approved').length,
  };
  useEffect(() => {
    if (!account) return;
    setFormsLoading(true);
    getOwnedForms(account.address).then(async (ownedForms) => {
      const enriched = ownedForms.map((f) => {
        try {
          const cfg = JSON.parse(f.configJson) as FormConfig;
          return { ...f, title: cfg?.title };
        } catch { return f; }
      });
      setForms(enriched);
      if (enriched.length > 0 && !selectedFormId) setSelectedFormId(enriched[0].suiObjectId);
    }).finally(() => setFormsLoading(false));
  }, [account]);

  // Load submissions when form selected
  const loadSubs = useCallback(async (formObjectId: string, ownerAddr: string) => {
    if (!formObjectId || !ownerAddr) return;
    setSubsLoading(true);
    setSubs([]);
    setSelectedSubId('');
    try {
      const suiSubs = await getOwnedSubmissions(ownerAddr, formObjectId);
      const loaded: Submission[] = [];
      for (const s of suiSubs) {
        try {
          const data = JSON.parse(s.payloadJson) as Submission;
          if (data) loaded.push({ ...data, blobId: s.suiObjectId, status: s.status || data.status || 'new' });
        } catch { /* skip unreadable */ }
      }
      loaded.sort((a, b) => b.timestamp - a.timestamp);
      setSubs(loaded);
    } catch (e) { console.error('[Admin] loadSubs error:', e); }
    setSubsLoading(false);
  }, []); // forms is not used in loadSubs

  useEffect(() => {
    if (selectedFormId && account) loadSubs(selectedFormId, account.address);
  }, [selectedFormId, account, loadSubs]);

  function handleStatusChange(subId: string, newStatus: string) {
    setSubs(prev => prev.map(s => s.id === subId ? { ...s, status: newStatus } : s));
  }

  async function handleOpenById() {
    const id = openByIdInput.trim();
    if (!id) return;
    setOpenByIdLoading(true);
    setOpenByIdError('');
    try {
      const obj = await getFormByObjectId(id);
      if (!obj) throw new Error('Form object not found.');
      let form: FormConfig;
      try { form = JSON.parse(obj.configJson); } catch { throw new Error('Could not read form data.'); }
      setForms(prev => prev.some(f => f.suiObjectId === id) ? prev : [{ suiObjectId: id, configJson: obj.configJson, formId: obj.formId, createdAt: obj.createdAt, title: form.title }, ...prev]);
      setSelectedFormId(id);
      if (account) loadSubs(id, account.address);
    } catch (e: any) { setOpenByIdError(e.message || 'Failed to open form.'); }
    setOpenByIdLoading(false);
  }

  const selectedForm = forms.find(f => f.suiObjectId === selectedFormId);
  const selectedSub = subs.find(s => s.id === selectedSubId);
  const selectedSubIdx = subs.findIndex(s => s.id === selectedSubId);
  const parsedFormConfig = selectedForm ? JSON.parse(selectedForm.configJson) : null;

  // ── Not connected ───────────────────────────────────────────────
  if (!account) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', padding: 16 }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16,1,0.3,1] }}
          className="card-glass"
          style={{ padding: '48px 40px', maxWidth: 420, width: '100%', textAlign: 'center' }}
        >
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 24px', boxShadow: 'var(--glow-sm)' }}>🔐</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 10, letterSpacing: '-0.03em' }} className="gradient-text">Admin Console</h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 28, lineHeight: 1.75 }}>
            Connect your Sui wallet to access your form dashboard and review responses.
          </p>
          <ConnectButton instance={dAppKit} />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout-root mobile-min-h-screen mobile-h-auto" style={{ backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div className="dashboard-layout" style={{ 
        flex: 1, 
        minHeight: 0,
        gridTemplateColumns: isSidebarCollapsed ? '64px 1fr' : '260px 1fr'
      }}>

        <aside className="dashboard-sidebar" style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>OPEN BY FORM ID</div>
            <input className="input" placeholder="0x…" value={openByIdInput} onChange={e => setOpenByIdInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleOpenById()} style={{ fontSize: 12 }} />
            {openByIdError && <p style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>{openByIdError}</p>}
            <button className="btn btn-secondary btn-sm" onClick={handleOpenById} disabled={openByIdLoading} style={{ marginTop: 8, width: '100%' }}>
              {openByIdLoading ? <><span className="spinner" style={{ width: 12, height: 12 }} />Loading…</> : 'Open Admin'}
            </button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }} className="custom-scrollbar hide-mobile">
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 12 }}>MY FORMS</div>
            <FormSidebar forms={forms} selectedId={selectedFormId} onSelect={id => setSelectedFormId(id)} loading={formsLoading} />
          </div>
        </aside>

        <div className="dashboard-content" style={{ display: 'flex', flexDirection: 'column' }}>

          {selectedForm ? (
            <div 
              className="mobile-p-4 mobile-stack mobile-gap-4"
              style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 24 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <motion.img 
                    src="/walform-mascot.png" 
                    alt="Walform" 
                    style={{ height: '48px', width: 'auto', filter: 'drop-shadow(0 0 12px rgba(139,92,246,0.3))' }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Forms /</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--accent-2)' }}>{selectedForm.suiObjectId}</span>
                        <button onClick={copyId} style={{ border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0 }}>
                          {idCopied ? '✅' : '📋'}
                        </button>
                      </div>
                    </div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }}>{selectedForm.title || 'Untitled Form'}</h1>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                   <button className="btn btn-secondary btn-sm" style={{ gap: 6 }} onClick={() => exportCSV(subs)}>⬇️ CSV</button>
                   <button className="btn btn-secondary btn-sm" style={{ gap: 6 }} onClick={() => exportJSON(subs)}>⬇️ JSON</button>
                   <a 
                     href={`/f/?formId=${selectedForm.suiObjectId}`} 
                     target="_blank" 
                     className="btn btn-primary btn-sm" 
                     style={{ gap: 6, textDecoration: 'none' }}
                   >
                     ↗️ Open Form
                   </a>
                </div>
              </div>

              {/* Stats Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                <div className="card-premium" style={{ padding: '20px', textAlign: 'center', background: 'rgba(34,211,238,0.03)' }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>OPEN</p>
                  <p style={{ fontSize: 32, fontWeight: 900, color: '#22d3ee' }}>{stats.new}</p>
                </div>
                <div className="card-premium" style={{ padding: '20px', textAlign: 'center', background: 'rgba(251,191,36,0.03)' }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>REVIEWING</p>
                  <p style={{ fontSize: 32, fontWeight: 900, color: '#fbbf24' }}>{stats.reviewing}</p>
                </div>
                <div className="card-premium" style={{ padding: '20px', textAlign: 'center', background: 'rgba(74,222,128,0.03)' }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>DONE</p>
                  <p style={{ fontSize: 32, fontWeight: 900, color: '#4ade80' }}>{stats.done}</p>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)' }}>
              <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text-2)' }}>Select a form</h1>
            </div>
          )}

          {selectedForm && (
            <div className="mobile-grid-1" style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', minHeight: 0 }}>
              <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>RESPONSES ({subs.length})</div>
                </div>
                
                {subsLoading && <div className="skeleton-shimmer" style={{ height: 60, borderRadius: 12 }} />}
                
                {subs.map((sub, i) => (
                  <button 
                    key={sub.id} 
                    onClick={() => setSelectedSubId(sub.id)}
                    className={`sub-card-premium ${selectedSubId === sub.id ? 'selected' : ''}`}
                    style={{ width: '100%', textAlign: 'left', padding: '14px 18px', borderLeft: `4px solid ${sub.status === 'done' ? '#4ade80' : sub.status === 'reviewing' ? '#fbbf24' : '#22d3ee'}` }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{fmtTime(sub.timestamp)}</span>
                      <div className="status-dot" style={{ background: sub.status === 'done' ? '#4ade80' : sub.status === 'reviewing' ? '#fbbf24' : '#22d3ee' }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: selectedSubId === sub.id ? 'var(--text-1)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {Object.values(sub.data)[0] || 'Empty Response'}
                    </div>
                  </button>
                ))}
              </div>

              {/* Detail panel */}
              <div className="mobile-overflow-visible mobile-h-auto" style={{ overflow: 'auto', padding: '24px' }}>
                {selectedSub ? (
                  <SubmissionDetail 
                    sub={selectedSub} 
                    idx={selectedSubIdx} 
                    onStatusChange={handleStatusChange} 
                    decryptionSig={decryptionSig}
                    onUnlock={handleUnlock}
                    unlocking={unlocking}
                    config={parsedFormConfig}
                    formId={selectedFormId}
                    onUpdateNote={handleUpdateNote}
                  />
                ) : (
                  <div className="empty-state">
                    <p>Select a response to view details.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No form selected */}
          {!selectedForm && (
            <div className="empty-state" style={{ flex: 1 }}>
              <div style={{ fontSize: 48 }}>📋</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}>No form selected</p>
              <p>Choose a form from the sidebar or enter a Form ID.</p>
              <a href="/builder" className="btn btn-primary">Create your first form</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
