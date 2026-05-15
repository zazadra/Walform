'use client';
import { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { readJsonFromWalrus, extendWalrusBlob, findWalrusBlobObjectId } from '@/lib/walrus';
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
function SubmissionDetail({ sub, idx, onStatusChange, decryptionSig, onUnlock }: { 
  sub: Submission; 
  idx: number; 
  onStatusChange: (id: string, status: string) => void;
  decryptionSig: string | null;
  onUnlock: () => void;
}) {
  const [note, setNote] = useState(sub.adminNotes || '');
  const [decryptedData, setDecryptedData] = useState<Record<string, any> | null>(null);
  const [decryptErr, setDecryptErr] = useState(false);

  useEffect(() => {
    if (sub.data?.__encrypted && decryptionSig) {
      const { decryptData } = require('@/lib/seal');
      decryptData(sub.data.__encrypted, decryptionSig)
        .then((dec: string) => {
          setDecryptedData(JSON.parse(dec));
          setDecryptErr(false);
        })
        .catch(() => setDecryptErr(true));
    } else {
      setDecryptedData(null);
    }
  }, [sub.data, decryptionSig]);

  const displayData = sub.data?.__encrypted ? (decryptedData || {}) : sub.data;
  const isEncrypted = !!sub.data?.__encrypted;
  const STATUSES = ['new', 'reviewing', 'done', 'rejected'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>Response #{idx + 1}</span>
        <StatusBadge status={sub.status} />
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { label: 'SUBMITTER', value: sub.submitterAddress || '—' },
          { label: 'STATUS', value: null },
          { label: 'ROOT HASH', value: sub.blobId || sub.id },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>{label}</div>
            {label === 'STATUS' ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUSES.map(st => (
                  <button key={st} onClick={() => onStatusChange(sub.id, st)}
                    className={`btn btn-sm ${sub.status === st ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: 13, padding: '6px 14px', borderRadius: 8, fontWeight: 700 }}>
                    {st}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mono" style={{ fontSize: 12, color: 'var(--text-2)', wordBreak: 'break-all', lineHeight: 1.7 }}>{value}</div>
            )}
          </div>
        ))}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

      {/* Answers */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)' }}>ANSWERS</div>
          {isEncrypted && !decryptionSig && (
            <button className="btn btn-primary btn-sm" onClick={onUnlock} style={{ fontSize: 11, height: 26, padding: '0 12px' }}>
              Unlock Data
            </button>
          )}
          {isEncrypted && decryptionSig && !decryptedData && !decryptErr && <span className="spinner-sm" />}
          {decryptErr && <span style={{ fontSize: 11, color: 'var(--error)' }}>Unlock failed (Check Wallet)</span>}
        </div>
        
        <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '45vh', overflowY: 'auto', paddingRight: 8 }}>
          {isEncrypted && !decryptionSig ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>This response is E2E encrypted.</p>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Click unlock and sign to view.</p>
            </div>
          ) : (
            Object.entries(displayData).map(([key, rawVal]) => {
              const isImgKey = /image|screenshot|visual|proof|file/i.test(key)
              
              // Normalize val into an array of items
              let items: any[] = [];
              if (Array.isArray(rawVal)) {
                items = rawVal;
              } else if (typeof rawVal === 'string') {
                if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
                  try { items = JSON.parse(rawVal); } catch { items = [rawVal]; }
                } else if (rawVal.includes(',')) {
                  items = rawVal.split(',').map(s => s.trim());
                } else {
                  items = [rawVal];
                }
              } else {
                items = [rawVal];
              }

              const renderItem = (itemVal: any) => {
                const s = String(itemVal ?? '')
                const isUrl = s.startsWith('http')
                const isBlob = s.length >= 43 && !s.includes(' ') && !s.startsWith('0x')
                
                if (isUrl) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <a href={s} target="_blank" rel="noreferrer" style={{ color: '#8b5cf6', textDecoration: 'underline', wordBreak: 'break-all' }}>{s}</a>
                      {(/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(s) || s.includes('aggregator')) && (
                        <img src={s} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4, border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} />
                      )}
                    </div>
                  )
                }
                
                if (isBlob) {
                  const blobId = s;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <a href={`https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${blobId}`} target="_blank" rel="noreferrer" style={{ color: '#8b5cf6', textDecoration: 'underline', wordBreak: 'break-all', fontSize: 12 }}>{s}</a>
                      {isImgKey && (
                        <div style={{ position: 'relative' }}>
                          <img src={`https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${blobId}`} alt="" style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 10, marginTop: 4, border: '1px solid var(--border)', display: 'block' }} />
                        </div>
                      )}
                    </div>
                  )
                }
                
                return s || '—';
              }
              
              return (
                <div key={key} style={{ paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: 8 }}>
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-1)', lineHeight: 1.6 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {items.map((item, idx) => (
                        <div key={idx}>{renderItem(item)}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

      {/* Internal note */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>INTERNAL NOTE</div>
        <textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Private note…" style={{ minHeight: 90, fontSize: 13 }} />
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Notes are stored locally in your browser.</div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {loading && <div style={{ padding: '12px', color: 'var(--text-3)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}><span className="spinner" style={{ width: 14, height: 14 }} />Loading forms…</div>}
      {!loading && forms.length === 0 && (
        <div style={{ padding: '20px 12px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
          No forms yet.<br />
          <a href="/builder" style={{ color: 'var(--accent-2)', textDecoration: 'none', fontWeight: 600 }}>Create one →</a>
        </div>
      )}
      {forms.map(f => (
        <button key={f.suiObjectId} onClick={() => onSelect(f.suiObjectId)}
          style={{ textAlign: 'left', background: selectedId === f.suiObjectId ? 'rgba(139,92,246,0.1)' : 'transparent', border: `1px solid ${selectedId === f.suiObjectId ? 'rgba(139,92,246,0.3)' : 'transparent'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { if (selectedId !== f.suiObjectId) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'var(--border)'; } }}
          onMouseLeave={e => { if (selectedId !== f.suiObjectId) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: selectedId === f.suiObjectId ? 'var(--text-1)' : 'var(--text-2)', marginBottom: 4 }}>
            {f.title || 'Untitled Form'}
          </div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{shortId(f.suiObjectId)}</div>
        </button>
      ))}
    </div>
  );
}

// ── Extend Storage Panel ─────────────────────────────────────────────
function ExtendStoragePanel({ publishedBlobId, ownerAddress, onClose }: {
  publishedBlobId?: string;
  ownerAddress: string;
  onClose: () => void;
}) {
  const [blobObjectId, setBlobObjectId] = useState('');
  const [epochs, setEpochs] = useState(1);
  const [status, setStatus] = useState<'idle' | 'searching' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [txDigest, setTxDigest] = useState('');
  const [autoFound, setAutoFound] = useState(false);

  // Auto-discover blob object ID from publishedBlobId if present
  useEffect(() => {
    if (!publishedBlobId || !ownerAddress) return;
    setStatus('searching');
    setMsg('Searching for blob in your wallet…');
    findWalrusBlobObjectId(publishedBlobId, ownerAddress)
      .then((found) => {
        if (found) {
          setBlobObjectId(found);
          setAutoFound(true);
          setMsg('');
        } else {
          setMsg('Blob not found in wallet — paste the Blob Object ID manually.');
        }
        setStatus('idle');
      })
      .catch(() => { setStatus('idle'); setMsg(''); });
  }, [publishedBlobId, ownerAddress]);

  async function handleExtend() {
    const id = blobObjectId.trim();
    if (!id.startsWith('0x') || id.length < 20) {
      setMsg('Enter a valid Blob Object ID (0x…)');
      return;
    }
    setStatus('busy');
    setMsg('Waiting for wallet signature…');
    try {
      const { txDigest: digest } = await extendWalrusBlob(id, epochs);
      setTxDigest(digest);
      setStatus('done');
      setMsg('Storage extended successfully! ✅');
    } catch (e: any) {
      const err = e?.message || String(e);
      setStatus('error');
      setMsg(err.length > 120 ? err.slice(0, 120) + '…' : err);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, padding: 28, display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-2)', marginBottom: 4 }}>Walrus Storage</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>⏱ Extend Epoch Duration</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 20, padding: 4 }}>✕</button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>
          Extending adds more epochs to a Walrus blob's storage period, preventing it from being garbage-collected.
          You need the <strong style={{ color: 'var(--text-1)' }}>Blob Object ID</strong> — a Sui object ID (<code style={{ fontSize: 11, color: 'var(--accent-2)' }}>0x…</code>) that appears in the Walrus registration transaction.
        </p>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

        {/* Blob Object ID */}
        <div>
          <label className="input-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            Blob Object ID (Sui object, not blob hash)
            {autoFound && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(74,222,128,0.12)', color: '#4ade80', fontWeight: 700 }}>Auto-detected ✓</span>}
          </label>
          <input
            id="extend-blob-object-id"
            className="input mono"
            placeholder="0x…"
            value={blobObjectId}
            onChange={e => { setBlobObjectId(e.target.value); setAutoFound(false); }}
            style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
            disabled={status === 'busy' || status === 'done'}
          />
        </div>

        {/* Epoch picker */}
        <div>
          <label className="input-label" style={{ marginBottom: 8 }}>Additional Epochs to Add</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1, 2, 3, 5, 10, 26, 52].map(n => (
              <button
                key={n}
                onClick={() => setEpochs(n)}
                className={`btn btn-sm ${epochs === n ? 'btn-primary' : 'btn-secondary'}`}
                disabled={status === 'busy' || status === 'done'}
                style={{ fontWeight: 700 }}
              >
                {n === 52 ? '52 (~1yr)' : n === 26 ? '26 (~6mo)' : `+${n}`}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>1 Walrus epoch ≈ 1 week. WAL tokens will be charged for the extra epochs.</p>
        </div>

        {/* Status */}
        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
            background: status === 'done' ? 'rgba(74,222,128,0.08)' : status === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${status === 'done' ? 'rgba(74,222,128,0.2)' : status === 'error' ? 'rgba(248,113,113,0.2)' : 'var(--border)'}`,
            color: status === 'done' ? '#4ade80' : status === 'error' ? '#f87171' : 'var(--text-2)',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            {status === 'busy' && <span className="spinner" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />}
            <span>{msg}</span>
          </div>
        )}

        {/* Tx Digest */}
        {txDigest && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8 }}>
            Tx: {txDigest}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          {status !== 'done' ? (
            <button
              id="extend-blob-sign-btn"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleExtend}
              disabled={status === 'busy' || status === 'searching' || !blobObjectId.trim()}
            >
              {status === 'busy'
                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Extending…</>
                : `✍️ Sign & Extend (+${epochs} epoch${epochs > 1 ? 's' : ''})`}
            </button>
          ) : (
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Close</button>
          )}
          {status !== 'done' && (
            <button className="btn btn-ghost" onClick={onClose} disabled={status === 'busy'}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main AdminDashboard ────────────────────────────────────────────
export function AdminDashboard() {
  const account = useCurrentAccount();

  // Forms list
  const [forms, setForms] = useState<{ suiObjectId: string; configJson: string; formId: string; createdAt: number; title?: string }[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showExtendPanel, setShowExtendPanel] = useState(false);

  // Submissions
  const [subs, setSubs] = useState<Submission[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [selectedSubIdx, setSelectedSubIdx] = useState(0);

  const [openByIdError, setOpenByIdError] = useState('');
  const [openByIdInput, setOpenByIdInput] = useState('');
  const [openByIdLoading, setOpenByIdLoading] = useState(false);
  
  // E2E Encryption state
  const [decryptionSig, setDecryptionSig] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlock = async () => {
    if (!account || !selectedFormId) return;
    setUnlocking(true);
    try {
      // Key is derived deterministically from admin address + formId
      // Matches the key used during encryption in the form submission
      const encKey = `walform:${account.address}:${selectedFormId}`;
      setDecryptionSig(encKey);
    } catch (err) {
      console.error('Unlock failed:', err);
    } finally {
      setUnlocking(false);
    }
  };


  // Load owned forms from Sui
  useEffect(() => {
    if (!account) return;
    setFormsLoading(true);
    getOwnedForms(account.address).then(async (ownedForms) => {
      // Also try server registry
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
    setSelectedSubIdx(0);
    try {
      // Primary: query Sui owned Submission objects
      const suiSubs = await getOwnedSubmissions(ownerAddr, formObjectId);
      const loaded: Submission[] = [];
      for (const s of suiSubs) {
        try {
          const data = JSON.parse(s.payloadJson) as Submission;
          if (data) loaded.push({ ...data, blobId: s.suiObjectId, status: s.status || data.status || 'new' });
        } catch { /* skip unreadable */ }
      }
      // 2. Secondary: query Server Registry for blob IDs
      try {
        const form = forms.find(f => f.suiObjectId === formObjectId);
        const formCfg = form ? JSON.parse(form.configJson) : null;
        const blobId = formCfg?.publishedBlobId;
        if (blobId) {
          const resp = await fetch(`/api/registry?formId=${blobId}`);
          if (resp.ok) {
            const { submissionBlobIds = [] } = await resp.json();
            const existingIds = new Set(loaded.map(s => s.blobId));
            for (const bid of submissionBlobIds) {
              if (existingIds.has(bid)) continue;
              try { 
                const d = await readJsonFromWalrus<Submission>(bid); 
                if (d) loaded.push({ ...d, blobId: bid, status: d.status || 'new' }); 
              } catch { /* skip */ }
            }
          }
        }
      } catch { /* skip */ }
      loaded.sort((a, b) => b.timestamp - a.timestamp);
      setSubs(loaded);
    } catch (e) { console.error('[Admin] loadSubs error:', e); }
    setSubsLoading(false);
  }, [forms]);

  useEffect(() => {
    if (selectedFormId && account) loadSubs(selectedFormId, account.address);
  }, [selectedFormId, account]);

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
      // Add to forms list if not there
      setForms(prev => prev.some(f => f.suiObjectId === id) ? prev : [{ suiObjectId: id, configJson: obj.configJson, formId: obj.formId, createdAt: obj.createdAt, title: form.title }, ...prev]);
      setSelectedFormId(id);
      if (account) loadSubs(id, account.address);
    } catch (e: any) { setOpenByIdError(e.message || 'Failed to open form.'); }
    setOpenByIdLoading(false);
  }

  // Stats
  const statNew = subs.filter(s => !s.status || s.status === 'new' || s.status === 'open').length;
  const statReviewing = subs.filter(s => s.status === 'reviewing' || s.status === 'pending').length;
  const statDone = subs.filter(s => s.status === 'done' || s.status === 'approved').length;

  const selectedForm = forms.find(f => f.suiObjectId === selectedFormId);
  const selectedSub = subs[selectedSubIdx];

  // ── Not connected ───────────────────────────────────────────────
  if (!account) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <div className="card" style={{ padding: '40px', maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>Admin Console</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24, lineHeight: 1.7 }}>
            Connect your Sui wallet to access your form dashboard and review responses.
          </p>
          <ConnectButton instance={dAppKit} />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout-root mobile-min-h-screen mobile-h-auto" style={{ backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Page layout: left sidebar + main content ── */}
      <div className="dashboard-layout" style={{ 
        flex: 1, 
        minHeight: 0,
        gridTemplateColumns: isSidebarCollapsed ? '64px 1fr' : '260px 1fr'
      }}>

        {/* ── Left: Forms sidebar ── */}
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

          <div className="hide-desktop" style={{ marginTop: 'auto' }}>
             <FormSidebar forms={forms} selectedId={selectedFormId} onSelect={id => setSelectedFormId(id)} loading={formsLoading} />
          </div>
        </aside>

        {/* ── Right: Main content ── */}
        <div className="dashboard-content" style={{ display: 'flex', flexDirection: 'column' }}>

          {/* Form header */}
          {selectedForm ? (
            <div 
              className="mobile-p-4 mobile-stack mobile-gap-4"
              style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <motion.img 
                  src="/walform-mascot.png" 
                  alt="Walform" 
                  style={{ height: '48px', width: 'auto', filter: 'drop-shadow(0 0 12px rgba(139,92,246,0.3))' }}
                  whileHover={{ scale: 1.1, rotate: -5 }}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <a href="/admin" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>← Forms</a>
                    <span style={{ color: 'var(--text-3)' }}>/</span>
                    <button onClick={() => { navigator.clipboard.writeText(selectedFormId); }} className="mono" style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-2)', cursor: 'pointer' }}>
                      {shortId(selectedFormId)} 📋
                    </button>
                  </div>
                  <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }}>{selectedForm.title || 'Untitled Form'}</h1>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowExtendPanel(true)} title="Extend Walrus blob storage duration">
                  ⏱ Extend Epoch
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(subs)}>
                  ↓ CSV
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { const json = JSON.stringify(subs, null, 2); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'submissions.json'; a.click(); }}>
                  ↓ JSON
                </button>
                <a href={`/f/?formId=${selectedFormId}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                  ↗ Open Form
                </a>
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)' }}>
              <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text-2)' }}>Select a form</h1>
            </div>
          )}

          {/* Content */}
          {selectedForm && (
            <div className="mobile-grid-1" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', minHeight: 0 }}>

              {/* Submissions list */}
              <div className="mobile-overflow-visible" style={{ borderRight: '1px solid var(--border)', overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Stats */}
                <div 
                  className="mobile-stack"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 8 }}
                >
                  {[['OPEN', statNew, '#22d3ee'], ['REVIEWING', statReviewing, '#fbbf24'], ['DONE', statDone, '#4ade80']].map(([label, count, color]) => (
                    <div key={label as string} className="card" style={{ padding: '12px 16px', borderRadius: 'var(--r)', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: color as string, marginBottom: 4 }}>{label as string}</div>
                      <div style={{ fontSize: 24, fontWeight: 900 }}>{count as number}</div>
                    </div>
                  ))}
                </div>

                {/* List header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>Responses</span>
                    {!subsLoading && <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>{subs.length} total</span>}
                  </div>
                  {subsLoading && <span className="spinner" style={{ width: 14, height: 14 }} />}
                  <button className="btn btn-ghost btn-sm" onClick={() => account && loadSubs(selectedFormId, account.address)} style={{ fontSize: 12 }}>↺ Refresh</button>
                </div>

                {!subsLoading && subs.length === 0 && (
                  <div className="empty-state">
                    <div style={{ fontSize: 36 }}>📭</div>
                    <p>No responses yet for this form.</p>
                    <a href={`/f/?formId=${selectedFormId}`} target="_blank" className="btn btn-secondary btn-sm" rel="noreferrer">Open form link →</a>
                  </div>
                )}

                {subs.map((sub, i) => (
                  <button key={sub.id} onClick={() => setSelectedSubIdx(i)} style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 12, background: selectedSubIdx === i ? 'rgba(139,92,246,0.06)' : 'var(--card)', border: `1px solid ${selectedSubIdx === i ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`, cursor: 'pointer', transition: 'all 0.15s', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {Object.values(sub.data)[0] ? String(Object.values(sub.data)[0]).slice(0, 32) + '…' : `Response #${i + 1}`}
                      </span>
                      <StatusBadge status={sub.status} />
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      {fmtTime(sub.timestamp)} · {sub.blobId ? shortId(sub.blobId) : sub.id.slice(0, 8)}
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
      {/* Extend Storage modal */}
      {showExtendPanel && account && (
        <ExtendStoragePanel
          publishedBlobId={selectedForm ? (() => {
            try { return (JSON.parse(selectedForm.configJson) as any)?.publishedBlobId; } catch { return undefined; }
          })() : undefined}
          ownerAddress={account.address}
          onClose={() => setShowExtendPanel(false)}
        />
      )}
    </div>
  );
}
