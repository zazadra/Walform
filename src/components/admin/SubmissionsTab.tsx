'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import type { Submission, SubmissionStatus } from '@/types/motion';
import { readJsonFromWalrus, getWalrusScanUrl, uploadJsonToWalrus, getWalrusBlobUrl } from '@/lib/walrus';
import { getSubIds, getAllSubIds, getAdmins } from '@/lib/fields';
import { getIndexedBlobIds, onNewSubmission } from '@/lib/submission-index';

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
  link.setAttribute('download', `motion-submissions-${new Date().toISOString().split('T')[0]}.csv`);
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
        const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = await import('@mysten/sui/jsonRpc');
        const { getWalrusClient } = await import('@/lib/walrus-onchain');
        const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet') });
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
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--text-3)', gap: '10px', flexDirection: 'column', alignItems: 'center' }}>
          <span className="spinner" style={{ width: '22px', height: '22px' }} />
          <span style={{ fontSize: '13px' }}>Loading submissions…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-3)', fontSize: '14px', lineHeight: 2 }}>
          📭 No submissions yet.<br />
          <span style={{ fontSize: '12px' }}>
            Submissions appear automatically when users submit the form.
          </span>
        </div>
      ) : filtered.map(s => (
        <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}
            onClick={() => setExpanded(e => e === s.id ? null : s.id)}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[s.status], flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>
                {(s.data.project_name as string) || 'Unnamed Project'}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                {(s.data.session_select as string) && <span style={{ color: 'var(--accent-2)', marginRight: '6px' }}>{s.data.session_select as string}</span>}
                {(s.data.leader_name as string) || ''}
                {' · '}{new Date(s.timestamp).toLocaleDateString('en-GB')}
                {' · '}{s.submitterAddress ? `${s.submitterAddress.slice(0, 8)}…` : 'Anonymous'}
              </p>
            </div>
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', flexShrink: 0,
              background: `${STATUS_COLORS[s.status]}18`, color: STATUS_COLORS[s.status],
              border: `1px solid ${STATUS_COLORS[s.status]}30`,
            }}>
              {s.status}
            </span>
            <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>{expanded === s.id ? '▲' : '▼'}</span>
          </div>

          {/* Detail */}
          {expanded === s.id && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px', maxHeight: '520px', overflowY: 'auto' }}>
                {Object.entries(s.data).map(([k, v]) => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px', fontSize: '13px', alignItems: 'start' }}>
                    <span style={{ color: 'var(--text-3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: '2px' }}>
                      {k.replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: 'var(--text-1)', wordBreak: 'break-word', lineHeight: 1.5 }}>
                      {typeof v === 'boolean' ? (v ? '✓ Yes' : '✗ No')
                        : Array.isArray(v) ? v.join(', ')
                        : v.toString().startsWith('http')
                          ? <a href={v.toString()} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-2)', textDecoration: 'none' }}>{v.toString()} ↗</a>
                          : (typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v))
                            ? <div>
                                <a href={getWalrusBlobUrl(v)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-2)', textDecoration: 'none', display: 'block', marginBottom: '8px' }}>
                                  {v} ↗
                                </a>
                                <img src={getWalrusBlobUrl(v)} style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', border: '1px solid var(--border)' }} onError={(e) => e.currentTarget.style.display = 'none'} />
                              </div>
                          : v.toString() || <em style={{ color: 'var(--text-3)' }}>—</em>}
                    </span>
                  </div>
                ))}
                {s.signature && (
                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px', fontSize: '13px', alignItems: 'start' }}>
                    <span style={{ color: 'var(--text-3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signature</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: '#4ade80', wordBreak: 'break-all' }}>{s.signature.slice(0, 80)}…</span>
                  </div>
                )}
              </div>
              {/* Actions */}
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea className="textarea" rows={2} placeholder="Admin notes…"
                  style={{ minHeight: 'unset', resize: 'none', fontSize: '13px' }}
                  value={notes[s.id] ?? s.adminNotes ?? ''}
                  onChange={e => setNotes(n => ({ ...n, [s.id]: e.target.value }))} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', flex: 1 }}
                    onClick={() => updateStatus(s, 'approved')}
                    disabled={updatingId === s.id}
                  >
                    {updatingId === s.id ? <><span className="spinner" style={{ width: '12px', height: '12px' }} /> Saving…</> : '✓ Approve'}
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', flex: 1 }}
                    onClick={() => updateStatus(s, 'rejected')}
                    disabled={updatingId === s.id}
                  >
                    {updatingId === s.id ? <><span className="spinner" style={{ width: '12px', height: '12px' }} /> Saving…</> : '✕ Reject'}
                  </button>
                  {s.blobId && (
                    <a href={getWalrusScanUrl(s.blobId)} target="_blank" rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Walruscan ↗</a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
