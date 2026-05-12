'use client';
import { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { readJsonFromWalrus } from '@/lib/walrus';
import { getOwnedForms, getOwnedSubmissions, getFormByObjectId } from '@/lib/walrus-onchain';
import type { FormConfig, Submission } from '@/types/walform';
import { loadAdminConfig, saveAdminConfig, DEFAULT_CONFIG } from '@/lib/fields';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const FormBuilderTab = dynamic(() => import('@/components/admin/FormBuilderTab').then(m => m.FormBuilderTab), { ssr: false });

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
function SubmissionDetail({ sub, idx, onStatusChange }: { sub: Submission; idx: number; onStatusChange: (id: string, status: string) => void }) {
  const [note, setNote] = useState(sub.adminNotes || '');
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
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
            {label === 'STATUS' ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUSES.map(st => (
                  <button key={st} onClick={() => onStatusChange(sub.id, st)}
                    className={`btn btn-sm ${sub.status === st ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>
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
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 14 }}>ANSWERS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(sub.data).map(([key, val]) => (
            <div key={key}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: 4 }}>
                {key.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-1)', lineHeight: 1.6 }}>
                {Array.isArray(val) ? val.join(', ') : String(val ?? '—')}
              </div>
            </div>
          ))}
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
  forms: { suiObjectId: string; walrusBlobId: string; formId: string; createdAt: number; title?: string }[];
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

// ── Main AdminDashboard ────────────────────────────────────────────
export function AdminDashboard() {
  const account = useCurrentAccount();
  const [tab, setTab] = useState<'responses' | 'builder'>('responses');

  // Forms list
  const [forms, setForms] = useState<{ suiObjectId: string; walrusBlobId: string; formId: string; createdAt: number; title?: string }[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState('');

  // Submissions
  const [subs, setSubs] = useState<Submission[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [selectedSubIdx, setSelectedSubIdx] = useState(0);

  // Open-by-FormID
  const [openByIdInput, setOpenByIdInput] = useState('');
  const [openByIdLoading, setOpenByIdLoading] = useState(false);
  const [openByIdError, setOpenByIdError] = useState('');

  // Builder config
  const [builderConfig, setBuilderConfig] = useState<FormConfig>(DEFAULT_CONFIG);
  useEffect(() => { const s = loadAdminConfig(); if (s) setBuilderConfig(s); }, []);

  // Load owned forms from Sui
  useEffect(() => {
    if (!account) return;
    setFormsLoading(true);
    getOwnedForms(account.address).then(async (ownedForms) => {
      // Also try server registry
      const enriched = await Promise.all(ownedForms.map(async (f) => {
        try {
          const cfg = await readJsonFromWalrus<FormConfig>(f.walrusBlobId);
          return { ...f, title: cfg?.title };
        } catch { return f; }
      }));
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
          const data = await readJsonFromWalrus<Submission>(s.walrusBlobId);
          if (data) loaded.push({ ...data, blobId: s.walrusBlobId, status: s.status || data.status || 'new' });
        } catch { /* skip unreadable */ }
      }
      // Fallback: server registry
      if (loaded.length === 0) {
        try {
          const form = forms.find(f => f.suiObjectId === formObjectId);
          const blobId = form?.walrusBlobId;
          if (blobId) {
            const resp = await fetch(`/api/registry?formBlobId=${blobId}`);
            if (resp.ok) {
              const { submissionBlobIds = [] } = await resp.json();
              for (const bid of submissionBlobIds) {
                try { const d = await readJsonFromWalrus<Submission>(bid); if (d) loaded.push({ ...d, blobId: bid, status: d.status || 'new' }); } catch { /* skip */ }
              }
            }
          }
        } catch { /* skip */ }
      }
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
      const form = await readJsonFromWalrus<FormConfig>(obj.walrusBlobId);
      if (!form) throw new Error('Could not read form data.');
      // Add to forms list if not there
      setForms(prev => prev.some(f => f.suiObjectId === id) ? prev : [{ suiObjectId: id, walrusBlobId: obj.walrusBlobId, formId: obj.formId, createdAt: obj.createdAt, title: form.title }, ...prev]);
      setSelectedFormId(id);
      setTab('responses');
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
    <div style={{ minHeight: '100dvh', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Page layout: left sidebar + main content ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', flex: 1, minHeight: 0 }}>

        {/* ── Left: Forms sidebar ── */}
        <aside style={{ borderRight: '1px solid var(--border)', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', background: 'rgba(5,6,11,0.5)' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 12 }}>MY FORMS</div>
            <FormSidebar forms={forms} selectedId={selectedFormId} onSelect={id => { setSelectedFormId(id); setTab('responses'); }} loading={formsLoading} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>OPEN BY FORM ID</div>
            <input className="input" placeholder="0x…" value={openByIdInput} onChange={e => setOpenByIdInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleOpenById()} style={{ fontSize: 12 }} />
            {openByIdError && <p style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>{openByIdError}</p>}
            <button className="btn btn-secondary btn-sm" onClick={handleOpenById} disabled={openByIdLoading} style={{ marginTop: 8, width: '100%' }}>
              {openByIdLoading ? <><span className="spinner" style={{ width: 12, height: 12 }} />Loading…</> : 'Open Admin'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <a href="/builder" className="btn btn-primary btn-sm" style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}>
              + New Form
            </a>
          </div>
        </aside>

        {/* ── Right: Main content ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Form header */}
          {selectedForm ? (
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
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
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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

          {/* Tabs */}
          {selectedForm && (
            <div style={{ padding: '0 32px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 0 }}>
              {([['responses', 'Responses'], ['builder', 'Builder']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} style={{ padding: '14px 20px', fontSize: 14, fontWeight: tab === key ? 700 : 500, color: tab === key ? 'var(--accent-2)' : 'var(--text-2)', background: 'none', border: 'none', borderBottom: `2px solid ${tab === key ? 'var(--accent-2)' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          {tab === 'responses' && selectedForm && (
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', overflow: 'hidden' }}>

              {/* Submissions list */}
              <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 8 }}>
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
                  <button key={sub.id} onClick={() => setSelectedSubIdx(i)} style={{ textAlign: 'left', padding: '14px 16px', borderRadius: 'var(--r-lg)', background: selectedSubIdx === i ? 'rgba(139,92,246,0.06)' : 'var(--card)', border: `1px solid ${selectedSubIdx === i ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`, cursor: 'pointer', transition: 'all 0.15s', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                        {Object.values(sub.data)[0] ? String(Object.values(sub.data)[0]).slice(0, 40) + '…' : `Response #${i + 1}`}
                      </span>
                      <StatusBadge status={sub.status} />
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {sub.blobId ? shortId(sub.blobId) : sub.id.slice(0, 12)}… · {fmtTime(sub.timestamp)}
                    </div>
                  </button>
                ))}
              </div>

              {/* Detail panel */}
              <div style={{ overflow: 'auto', padding: '24px' }}>
                {selectedSub ? (
                  <SubmissionDetail sub={selectedSub} idx={selectedSubIdx} onStatusChange={handleStatusChange} />
                ) : (
                  <div className="empty-state">
                    <p>Select a response to view details.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Builder tab */}
          {tab === 'builder' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
              <FormBuilderTab config={builderConfig} onChange={c => { setBuilderConfig(c); saveAdminConfig(c); }} ownerAddress={account.address} />
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
