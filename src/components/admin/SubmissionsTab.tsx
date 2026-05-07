'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import type { Submission, SubmissionStatus } from '@/types/walform';
import { readJsonFromWalrus, getWalrusScanUrl, uploadJsonToWalrus, getWalrusBlobUrl } from '@/lib/walrus';
import { getSubIds, getAllSubIds, getAdmins } from '@/lib/fields';
import { getIndexedBlobIds, onNewSubmission } from '@/lib/submission-index';
import { motion } from 'framer-motion';

function shorten(a: string) { return `${a.slice(0,6)}…${a.slice(-4)}`; }

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  pending: '#fbbf24', approved: '#4ade80', rejected: '#f87171',
};

function exportCSV(subs: Submission[]) {
  if (!subs.length) return;
  // Get all unique data keys
  const dataKeys = [...new Set(subs.flatMap(s => Object.keys(s.data)))];
  
  // Create headers
  const headers = ['Submission ID', 'Timestamp', 'Submitter Address', 'Status', ...dataKeys];
  
  // Helper to escape CSV values
  const escape = (val: any) => {
    const str = Array.isArray(val) ? val.join('; ') : String(val ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  };

  const csvRows = [
    headers.map(h => `"${h}"`).join(','), // header row
    ...subs.map(s => [
      `"${s.id}"`,
      `"${new Date(s.timestamp).toISOString()}"`,
      `"${s.submitterAddress || ''}"`,
      `"${s.status}"`,
      ...dataKeys.map(k => escape(s.data[k]))
    ].join(','))
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `walform-submissions-${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function SubmissionsTab({ formBlobId: initialFormBlobId }: { formBlobId: string }) {
  const [activeBlobId, setActiveBlobId] = useState(initialFormBlobId);
  const [blobIdInput, setBlobIdInput]   = useState(initialFormBlobId === 'default' ? '' : initialFormBlobId);

  const [subs, setSubs]         = useState<Submission[]>([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false); // background chain sync
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter]     = useState<SubmissionStatus | 'all'>('all');
  const [notes, setNotes]       = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null); // for optimistic updates
  const loadedIdsRef = useRef<Set<string>>(new Set());

  const account = useCurrentAccount();

  // ── Fast load from localStorage first ──────────────────────────────
  const loadFromIndex = useCallback(async (existingSubs?: Submission[]) => {
    const key = activeBlobId === 'default' ? '' : activeBlobId;

    // Collect all known blobIds from localStorage index
    let allIds: string[] = [
      ...getIndexedBlobIds(),
      ...getAllSubIds(),
      ...(key ? getSubIds(key) : []),
    ];
    allIds = [...new Set(allIds)];

    // Filter out already-loaded IDs to avoid redundant fetches
    const newIds = allIds.filter(id => !loadedIdsRef.current.has(id));
    if (!newIds.length) return;

    const base = existingSubs ?? subs;
    const results = await Promise.allSettled(
      newIds.map(id =>
        readJsonFromWalrus<Submission>(id)
          .then(s => ({ ...s, blobId: s.blobId ?? id }))
      )
    );

    const fetched: Submission[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        loadedIdsRef.current.add(newIds[i]);
        fetched.push(r.value);
      }
    });

    if (!fetched.length) return;

    const merged = [...base, ...fetched];
    // Filter to valid submissions only (has status + formBlobId or formId)
    let valid = merged.filter(s => s && s.status !== undefined && (s.formBlobId || s.formId));
    // Deduplicate by id
    const seen = new Set<string>();
    valid = valid.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
    // Filter by form if not "show all"
    if (key) valid = valid.filter(s => (s.formId === key || s.formBlobId === key));

    setSubs(valid.sort((a, b) => b.timestamp - a.timestamp));
  }, [activeBlobId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Background on-chain sync via getOwnedObjects ───────────────────
  const syncFromChain = useCallback(async () => {
    if (typeof window === 'undefined') return;
    setSyncing(true);
    console.log('[Sync] Starting on-chain discovery...');
    const adminAddresses = [...new Set([account?.address, ...getAdmins()])].filter(Boolean) as string[];
    const chainIds: string[] = [];
    console.log('[Sync] Searching for blobs owned by:', adminAddresses);

    for (const adminAddr of adminAddresses) {
      try {
        const { SuiJsonRpcClient } = await import('@mysten/sui/jsonRpc');
        const { getJsonRpcFullnodeUrl } = await import('@mysten/sui/jsonRpc');
        const { NETWORK } = await import('@/lib/walrus');
        const { getWalrusClient } = await import('@/lib/walrus-onchain');
        
        console.log("SUBMISSIONS SYNC: Using network", NETWORK);
        const client = new SuiJsonRpcClient({ 
          url: getJsonRpcFullnodeUrl(NETWORK as any),
          network: NETWORK as any
        });
        const structType = await getWalrusClient().getBlobType();

        let hasNextPage = true;
        let cursor: any = null;

        while (hasNextPage) {
          const res: any = await client.getOwnedObjects({
            owner: adminAddr,
            options: { showContent: true, showType: true },
            cursor
          });

          for (const obj of (res.data ?? [])) {
            if (obj.data?.type?.includes('::blob::Blob')) {
              const fields = obj.data.content.fields as any;
              if (fields?.blob_id) {
                const hex = BigInt(fields.blob_id).toString(16).padStart(64, '0');
                console.log('[Sync] Blob ID hex:', hex);
                const bytes = new Uint8Array(32);
                for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
                const blobId = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                console.log('[Sync] Decoded Blob ID:', blobId);
                chainIds.push(blobId);
              } else {
                console.warn('[Sync] Object missing blob_id field:', obj.data?.objectId);
              }
            }
          }
          hasNextPage = res.hasNextPage;
          cursor = res.nextCursor;
        }
      } catch (e) {
        console.error(`[Sync] Chain sync failed for ${adminAddr}:`, e);
      }
    }

    if (chainIds.length) {
      console.log('[Sync] Discovered chain IDs:', chainIds);
      // Persist any newly discovered chain IDs into the local index
      const { publishSubmission } = await import('@/lib/submission-index');
      chainIds.forEach(id => publishSubmission(id, activeBlobId === 'default' ? '' : activeBlobId));
      await loadFromIndex();
    } else {
      console.log('[Sync] No blobs found on-chain.');
    }
    setSyncing(false);
  }, [account?.address, activeBlobId, loadFromIndex]);

  // ── Initial load ────────────────────────────────────────────────────
  const fullLoad = useCallback(async () => {
    setLoading(true);
    loadedIdsRef.current = new Set();
    setSubs([]);
    await loadFromIndex([]);
    setLoading(false);
    // Run chain sync in background (don't block UI)
    syncFromChain();
  }, [loadFromIndex, syncFromChain]);

  useEffect(() => { fullLoad(); }, [fullLoad]);

  // ── BroadcastChannel: instant new submission from same-browser tabs ─
  useEffect(() => {
    const unsub = onNewSubmission(async (blobId) => {
      if (loadedIdsRef.current.has(blobId)) return;
      try {
        const s = await readJsonFromWalrus<Submission>(blobId);
        if (!s?.status) return;
        const sub = { ...s, blobId: s.blobId ?? blobId };
        loadedIdsRef.current.add(blobId);
        const key = activeBlobId === 'default' ? '' : activeBlobId;
        if (key && (sub.formId !== key && sub.formBlobId !== key)) return;
        setSubs(prev => {
          if (prev.some(x => x.id === sub.id)) return prev;
          return [sub, ...prev].sort((a, b) => b.timestamp - a.timestamp);
        });
      } catch { /* ignore */ }
    });
    return unsub;
  }, [activeBlobId]);

  // ── Optimistic status update ────────────────────────────────────────
  async function updateStatus(sub: Submission, status: SubmissionStatus) {
    const updated = { ...sub, status, adminNotes: notes[sub.id] ?? sub.adminNotes ?? '' };
    // Optimistic: update UI immediately
    setSubs(prev => prev.map(s => s.id === sub.id ? updated : s));
    setUpdatingId(sub.id);
    try {
      // Upload updated blob in background (Walrus is immutable — creates a new blob)
      await uploadJsonToWalrus(updated);
    } catch {
      // Revert on failure
      setSubs(prev => prev.map(s => s.id === sub.id ? sub : s));
      alert('Failed to save status update. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = subs.filter(s => filter === 'all' || s.status === filter);
  const isDefaultQuery = activeBlobId === 'default' || !activeBlobId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── Active form query ─────────────────────────── */}
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Submissions
          </p>
          {!isDefaultQuery && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(124,58,237,0.12)', color: 'var(--accent-2)', border: '1px solid rgba(124,58,237,0.25)' }}>
              {activeBlobId.slice(0, 16)}…
            </span>
          )}
          {isDefaultQuery && (
            <span style={{ fontSize: '12px', color: '#fbbf24' }}>showing all forms</span>
          )}
          {syncing && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-3)', marginLeft: 'auto' }}>
              <span className="spinner" style={{ width: '11px', height: '11px' }} /> syncing chain…
            </span>
          )}
        </div>

        {/* Override blob ID input */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="input"
            placeholder="Filter by Form Blob ID (empty = show all)"
            value={blobIdInput}
            onChange={e => setBlobIdInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setActiveBlobId(blobIdInput.trim() || 'default')}
            style={{ flex: 1, fontSize: '12px', fontFamily: 'var(--mono)' }}
          />
          <button className="btn btn-secondary btn-sm"
            onClick={() => setActiveBlobId(blobIdInput.trim() || 'default')}>
            Apply
          </button>
          {!isDefaultQuery && (
            <button className="btn btn-ghost btn-sm"
              onClick={() => { setBlobIdInput(''); setActiveBlobId('default'); }}>
              Show All
            </button>
          )}
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.7 }}>
              ({s === 'all' ? subs.length : subs.filter(x => x.status === s).length})
            </span>
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { fullLoad(); syncFromChain(); }} disabled={loading || syncing} style={{ gap:'6px' }}>
            {(loading || syncing) 
              ? <><span className="spinner" style={{ width: '11px', height: '11px' }} /> {loading ? 'Loading…' : 'Syncing…'}</> 
              : '↻ Refresh Dashboard'
            }
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(filtered)}>Export CSV</button>
        </div>
      </div>

      {/* ── List ─────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0', color: 'var(--text-3)', gap: '16px', flexDirection: 'column', alignItems: 'center' }}>
          <div className="spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
          <span style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.02em' }}>Fetching submissions from Walrus...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ 
          textAlign: 'center', padding: '100px 40px', borderRadius: '24px', 
          border: '1px dashed var(--border)', background: 'rgba(255,255,255,0.01)',
          color: 'var(--text-3)', fontSize: '15px' 
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.5 }}>📭</div>
          <p style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: '4px' }}>No submissions found</p>
          <p style={{ fontSize: '13px' }}>Submissions for this form will appear here in real-time.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(s => (
            <motion.div 
              layout
              key={s.id} 
              className="card" 
              style={{ 
                padding: 0, overflow: 'hidden', 
                border: expanded === s.id ? '1px solid var(--accent-soft)' : '1px solid var(--border)',
                boxShadow: expanded === s.id ? '0 8px 30px -10px rgba(139, 92, 246, 0.15)' : 'none',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              {/* Header */}
              <div 
                style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '20px 24px', cursor: 'pointer' }}
                onClick={() => setExpanded(e => e === s.id ? null : s.id)}
              >
                <div style={{ 
                  width: 40, height: 40, borderRadius: 12, 
                  background: `${STATUS_COLORS[s.status]}10`, 
                  border: `1px solid ${STATUS_COLORS[s.status]}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0 
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[s.status], boxShadow: `0 0 10px ${STATUS_COLORS[s.status]}` }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
                      {(s.data.project_name as string) || (s.data.name as string) || 'Untitled Submission'}
                    </p>
                    {s.data.session_select && (
                      <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'var(--accent-soft)', color: 'var(--accent-2)', textTransform: 'uppercase' }}>
                        {s.data.session_select as string}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 500 }}>
                    {s.submitterAddress ? shorten(s.submitterAddress) : 'Anonymous'}
                    <span style={{ margin: '0 8px', opacity: 0.3 }}>•</span>
                    {new Date(s.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 800, padding: '4px 12px', borderRadius: '6px', flexShrink: 0,
                    background: `${STATUS_COLORS[s.status]}15`, color: STATUS_COLORS[s.status],
                    border: `1px solid ${STATUS_COLORS[s.status]}25`,
                    textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}>
                    {s.status}
                  </span>
                  <div style={{ 
                    color: 'var(--text-3)', transition: 'transform 0.3s', 
                    transform: expanded === s.id ? 'rotate(180deg)' : 'none' 
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>

              {/* Detail */}
              {expanded === s.id && (
                <div style={{ padding: '0 24px 24px' }}>
                  <div style={{ 
                    display: 'flex', flexDirection: 'column', gap: '4px', 
                    background: 'rgba(255,255,255,0.015)', borderRadius: '16px', border: '1px solid var(--border)',
                    padding: '20px', marginTop: '4px'
                  }}>
                    {Object.entries(s.data).map(([k, v]) => (
                      <div key={k} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '20px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <span style={{ color: 'var(--text-3)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: '4px' }}>
                          {k.replace(/_/g, ' ')}
                        </span>
                        <div style={{ color: 'var(--text-1)', fontSize: '14px', wordBreak: 'break-word', lineHeight: 1.6 }}>
                          {typeof v === 'boolean' ? (
                            <span style={{ color: v ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>{v ? '✓ Yes' : '✗ No'}</span>
                          ) : Array.isArray(v) ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {v.map((item, i) => <span key={i} style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', fontSize: '12px' }}>{item}</span>)}
                            </div>
                          ) : v.toString().startsWith('http') ? (
                            <a href={v.toString()} target="_blank" rel="noopener noreferrer" className="link-premium">
                              {v.toString()} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4 }}><path d="M7 17L17 7M7 7h10v10"/></svg>
                            </a>
                          ) : (typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v)) ? (
                            <div style={{ marginTop: '4px' }}>
                              <a href={getWalrusBlobUrl(v)} target="_blank" rel="noopener noreferrer" className="link-premium" style={{ marginBottom: '12px', display: 'inline-flex' }}>
                                View Asset <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4 }}><path d="M7 17L17 7M7 7h10v10"/></svg>
                              </a>
                              <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', maxWidth: '300px' }}>
                                <img src={getWalrusBlobUrl(v)} style={{ width: '100%', display: 'block', maxHeight: '300px', objectFit: 'contain' }} onError={(e) => e.currentTarget.parentElement!.style.display = 'none'} />
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontWeight: 500 }}>{v.toString() || <em style={{ color: 'var(--text-3)', fontWeight: 400 }}>—</em>}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions Section */}
                  <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ position: 'relative' }}>
                      <label className="input-label" style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Admin Evaluation</label>
                      <textarea 
                        className="textarea" 
                        rows={3} 
                        placeholder="Add internal feedback or decision notes..."
                        value={notes[s.id] ?? s.adminNotes ?? ''}
                        onChange={e => setNotes(n => ({ ...n, [s.id]: e.target.value }))}
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '12px' }}
                      />
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        className="btn btn-sm"
                        style={{ 
                          background: 'rgba(74, 222, 128, 0.08)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.2)', 
                          flex: 1, height: '44px', fontWeight: 700, borderRadius: '12px' 
                        }}
                        onClick={() => updateStatus(s, 'approved')}
                        disabled={updatingId === s.id}
                      >
                        {updatingId === s.id ? <div className="spinner" style={{ width: '14px', height: '14px' }} /> : 'Approve Submission'}
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ 
                          background: 'rgba(248, 113, 113, 0.08)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.2)', 
                          flex: 1, height: '44px', fontWeight: 700, borderRadius: '12px' 
                        }}
                        onClick={() => updateStatus(s, 'rejected')}
                        disabled={updatingId === s.id}
                      >
                        {updatingId === s.id ? <div className="spinner" style={{ width: '14px', height: '14px' }} /> : 'Reject Submission'}
                      </button>
                      {s.blobId && (
                        <a href={getWalrusScanUrl(s.blobId)} target="_blank" rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm" style={{ textDecoration: 'none', width: 'auto', display: 'flex', alignItems: 'center', borderRadius: '12px' }}>
                          Scanner ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

    </div>
  );
}
