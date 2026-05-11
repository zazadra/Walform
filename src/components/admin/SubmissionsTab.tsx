'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Submission, SubmissionStatus } from '@/types/walform';
import { readJsonFromWalrus, getWalrusScanUrl, uploadJsonToWalrus, getWalrusBlobUrl } from '@/lib/walrus';
import { dAppKit } from '@/app/dapp-kit';
import { getSubIds, getAllSubIds } from '@/lib/fields';
import { getIndexedBlobIds, onNewSubmission } from '@/lib/submission-index';
import { getCachedSubIds, getCachedFormIds } from '@/lib/form-registry';
import { getFormRegistry, getSuiNativeSubmissions } from '@/lib/registry';
import { WALFORM_PACKAGE_ID } from '@/lib/walrus-onchain';
import { motion, AnimatePresence } from 'framer-motion';
import type { FormConfig } from '@/types/walform';
import dynamic from 'next/dynamic';

const MyFormsTab = dynamic(() => import('@/components/admin/MyFormsTab').then(m=>m.MyFormsTab), { ssr:false });

function shorten(a: string) { return `${a.slice(0,6)}-${a.slice(-4)}`; }

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  pending: '#fbbf24', approved: '#4ade80', rejected: '#f87171',
};

function exportCSV(subs: Submission[]) {
  if (!subs.length) return;
  const dataKeys = [...new Set(subs.flatMap(s => Object.keys(s.data)))];
  const headers = ['Submission ID', 'Timestamp', 'Submitter Address', 'Status', ...dataKeys];
  const escape = (val: any) => {
    const str = Array.isArray(val) ? val.join('; ') : String(val ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  };
  const csvRows = [
    headers.map(h => `"${h}"`).join(','),
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

interface SubmissionsTabProps {
  /** Connected wallet address - used to scan on-chain blob ownership */
  ownerAddress: string;
  /** Currently published form blob ID - used as default filter hint, but can be cleared */
  formBlobId?: string;
  /** Callback to switch to form builder */
  onSelectForm?: (config: FormConfig) => void;
}

type InternalTab = 'manager' | 'replies' | 'lookup';

export function SubmissionsTab({ ownerAddress, formBlobId: initialFormBlobId, onSelectForm }: SubmissionsTabProps) {
  const [internalTab, setInternalTab] = useState<InternalTab>(initialFormBlobId ? 'replies' : 'manager');
  const [filterBlobId, setFilterBlobId] = useState<string>(initialFormBlobId && initialFormBlobId !== 'default' ? initialFormBlobId : '');
  const [blobIdInput, setBlobIdInput]   = useState(initialFormBlobId && initialFormBlobId !== 'default' ? initialFormBlobId : '');

  const [subs, setSubs]         = useState<Submission[]>([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter]     = useState<SubmissionStatus | 'all'>('all');
  const [notes, setNotes]       = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  const [searchBlobId, setSearchBlobId] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<Submission | null>(null);
  const [searchError, setSearchError] = useState('');

  const loadedIdsRef = useRef<Set<string>>(new Set());

  // -- Fast load from localStorage first ------------------------------
  const loadFromIndex = useCallback(async (existingSubs?: Submission[]) => {
    // Collect all known blobIds from localStorage indexes
    let allIds: string[] = [
      ...getIndexedBlobIds(),
      ...getAllSubIds(),
      ...getCachedSubIds(ownerAddress),
      ...(filterBlobId ? getSubIds(filterBlobId) : []),
    ];
    allIds = [...new Set(allIds)];

    // Filter out already-loaded IDs
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

    let merged = [...base, ...fetched];
    // Keep only valid submissions
    let valid = merged.filter(s => s && s.status !== undefined && (s.formBlobId || s.formId));
    // Deduplicate by id
    const seen = new Set<string>();
    valid = valid.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
    
    // Filter by specific formId only if user has set a filter and not explicitly viewing all forms
    if (filterBlobId) {
      valid = valid.filter(s => (s.formId === filterBlobId || s.formBlobId === filterBlobId));
    }

    setSubs(valid.sort((a, b) => b.timestamp - a.timestamp));
  }, [filterBlobId, ownerAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- On-chain sync: scan blobs owned by admin wallet ----------------
  const syncFromChain = useCallback(async (isAuto = false) => {
    if (typeof window === 'undefined' || !ownerAddress) return;
    if (!isAuto) setSyncing(true);
    
    try {
      // 1. Get all forms we care about
      let formIds: string[] = [];
      if (filterBlobId) {
        // If filtering, only sync the specific form
        formIds = [filterBlobId];
      } else {
        // Otherwise, sync all owned forms
        formIds = getCachedFormIds(ownerAddress);
        if (formIds.length === 0) {
          // Quick scan for forms if cache is empty
          const { scanOwnedBlobs } = await import('@/lib/form-registry');
          const { forms } = await scanOwnedBlobs(ownerAddress);
          formIds = forms.map(f => f.publishedBlobId!).filter(Boolean);
        }
      }

      const allSubIds = new Set<string>();

      // 2. Try Sui Native First (if package deployed)
      if (WALFORM_PACKAGE_ID !== '0x0') {
        console.log('[Sync] Querying Sui Native objects...');
        const nativeIds = await getSuiNativeSubmissions(ownerAddress, WALFORM_PACKAGE_ID, filterBlobId || undefined);
        nativeIds.forEach(id => allSubIds.add(id));
      }

      // 3. Registry Fallback/Merge
      console.log(`[Sync] Fetching registries for ${formIds.length} forms...`);
      const registries = await Promise.all(
        formIds.map(fid => getFormRegistry(ownerAddress, fid))
      );
      registries.forEach(r => {
        r?.submissionBlobIds.forEach(id => allSubIds.add(id));
      });

      // 3. Filter for new ones
      const newIds = Array.from(allSubIds).filter(id => !loadedIdsRef.current.has(id));
      
      if (newIds.length > 0) {
        console.log(`[Sync] Fetching ${newIds.length} new submissions...`);
        const results = await Promise.allSettled(
          newIds.map(id => readJsonFromWalrus<Submission>(id).then(s => ({ ...s, blobId: id })))
        );

        const fetched: Submission[] = [];
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            loadedIdsRef.current.add(newIds[i]);
            fetched.push(r.value);
          }
        });

        if (fetched.length > 0) {
          setSubs(prev => {
            const combined = [...prev, ...fetched];
            const seen = new Set<string>();
            const deduped = combined.filter(s => {
              if (seen.has(s.id)) return false;
              seen.add(s.id);
              return true;
            });
            return deduped.sort((a, b) => b.timestamp - a.timestamp);
          });
        }
      }
    } catch (e) {
      console.error('[Sync] Registry sync failed:', e);
    }

    setSyncing(false);
  }, [ownerAddress, filterBlobId]);

  // -- Initial load ----------------------------------------------------
  const fullLoad = useCallback(async () => {
    setLoading(true);
    loadedIdsRef.current = new Set();
    setSubs([]);
    await loadFromIndex([]);
    setLoading(false);
    syncFromChain();
  }, [loadFromIndex, syncFromChain]);

  useEffect(() => { 
    fullLoad(); 
    // Auto-refresh every 10s
    const interval = setInterval(() => {
      syncFromChain(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [fullLoad, syncFromChain]);

  // -- BroadcastChannel: instant new submission from same-browser tabs -
  useEffect(() => {
    const unsub = onNewSubmission(async (blobId) => {
      if (loadedIdsRef.current.has(blobId)) return;
      try {
        const s = await readJsonFromWalrus<Submission>(blobId);
        if (!s?.status) return;
        const sub = { ...s, blobId: s.blobId ?? blobId };
        loadedIdsRef.current.add(blobId);
        // If we are filtering by a specific form, apply that filter
        if (filterBlobId && (sub.formId !== filterBlobId && sub.formBlobId !== filterBlobId)) return;
        setSubs(prev => {
          if (prev.some(x => x.id === sub.id)) return prev;
          return [sub, ...prev].sort((a, b) => b.timestamp - a.timestamp);
        });
      } catch { /* ignore */ }
    });
    return unsub;
  }, [filterBlobId]);

  // -- Optimistic status update ----------------------------------------
  async function updateStatus(sub: Submission, status: SubmissionStatus) {
    const updated = { ...sub, status, adminNotes: notes[sub.id] ?? sub.adminNotes ?? '' };
    setSubs(prev => prev.map(s => s.id === sub.id ? updated : s));
    setUpdatingId(sub.id);
    try {
      const signer = {
        address: ownerAddress,
        signAndExecute: async (transaction: unknown) => {
          const result = await dAppKit.signAndExecuteTransaction({ transaction: transaction as any });
          // dAppKit v2 returns { $kind, Transaction: { digest } }
          const digest = (result as any)?.Transaction?.digest ?? (result as any)?.digest;
          if (!digest) throw new Error('Wallet signing failed or was cancelled');
          return { digest };
        },
      };
      await uploadJsonToWalrus(updated, signer, 3);
    } catch {
      setSubs(prev => prev.map(s => s.id === sub.id ? sub : s));
      alert('Failed to save status update. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = subs.filter(s => filter === 'all' || s.status === filter);
  const isShowingAll = !filterBlobId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Internal Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
        <button className={`btn btn-sm ${internalTab === 'manager' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setInternalTab('manager')}>Manager</button>
        <button className={`btn btn-sm ${internalTab === 'replies' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setInternalTab('replies')}>Replies</button>
        <button className={`btn btn-sm ${internalTab === 'lookup' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setInternalTab('lookup')}>Lookup</button>
      </div>

      {internalTab === 'manager' && (
        <MyFormsTab 
          ownerAddress={ownerAddress} 
          onSelectForm={(cfg) => {
            if (onSelectForm) onSelectForm(cfg);
          }} 
          onSelectSubmissions={(blobId) => {
            setFilterBlobId(blobId);
            setBlobIdInput(blobId);
            setInternalTab('replies');
          }} 
        />
      )}

      {internalTab === 'lookup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Lookup Blob</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>Paste any Walrus Blob ID to view its content. Supports Forms and Submissions.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input"
                placeholder="e.g. xyz123..."
                value={searchBlobId}
                onChange={e => setSearchBlobId(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setSearchError('');
                    setSearchLoading(true);
                    setSearchResult(null);

                    const localSub = subs.find(s => (s.blobId === searchBlobId.trim()) || (s.id === searchBlobId.trim()));
                    if (localSub) {
                      setSearchResult(localSub);
                      setSearchLoading(false);
                      return;
                    }

                    readJsonFromWalrus<any>(searchBlobId.trim())
                      .then(obj => {
                        if (!obj) throw new Error('Blob empty or not found');
                        // Tag it so we know what it is
                        if (Array.isArray(obj.fields)) {
                          (obj as any)._type = 'form';
                        } else {
                          (obj as any)._type = 'submission';
                        }
                        setSearchResult({ ...obj, blobId: obj.blobId ?? searchBlobId.trim() });
                      })
                      .catch(err => setSearchError(err.message || 'Failed to load submission. It may still be propagating.'))
                      .finally(() => setSearchLoading(false));
                  }
                }}
                style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: '14px' }}
              />
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  setSearchError('');
                  setSearchLoading(true);
                  setSearchResult(null);

                  const localSub = subs.find(s => (s.blobId === searchBlobId.trim()) || (s.id === searchBlobId.trim()));
                  if (localSub) {
                    setSearchResult(localSub);
                    setSearchLoading(false);
                    return;
                  }

                  readJsonFromWalrus<any>(searchBlobId.trim())
                    .then(obj => {
                      if (!obj) throw new Error('Blob empty or not found');
                      if (Array.isArray(obj.fields)) {
                         (obj as any)._type = 'form';
                      } else {
                         (obj as any)._type = 'submission';
                      }
                      setSearchResult({ ...obj, blobId: obj.blobId ?? searchBlobId.trim() });
                    })
                    .catch(err => setSearchError(err.message || 'Failed to load submission. It may still be propagating.'))
                    .finally(() => setSearchLoading(false));
                }}
                disabled={searchLoading || !searchBlobId.trim()}
              >
                {searchLoading ? 'Loading...' : 'Search'}
              </button>
            </div>
            {searchError && <p style={{ color: 'var(--error)', fontSize: '13px' }}>⚠ {searchError}</p>}
          </div>

          {searchResult && (
            <div className="card" style={{ padding: '20px', borderLeft: `4px solid ${searchResult.fields ? 'var(--accent)' : STATUS_COLORS[(searchResult as any).status || 'pending']}` }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                 <div>
                   <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>{searchResult.fields ? 'Form Title' : 'Submission ID'}</p>
                   <p style={{ fontWeight: 700 }}>{searchResult.title || (searchResult.id ? shorten(searchResult.id) : 'Untitled')}</p>
                 </div>
                 <div style={{ textAlign: 'right' }}>
                   <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>Type</p>
                   <span style={{ 
                     display: 'inline-block', padding: '4px 10px', borderRadius: '20px', 
                     fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
                     backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-1)'
                   }}>
                     {(searchResult as any)._type || 'Blob'}
                   </span>
                 </div>
               </div>
               
               <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                 {searchResult.fields ? (
                   <div>
                     <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '12px' }}>{searchResult.description}</p>
                     <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                       {searchResult.fields.length} Fields defined
                     </div>
                   </div>
                 ) : (
                   Object.entries((searchResult as any).data || {}).map(([key, val]) => (
                     <div key={key} style={{ marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
                       <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-2)', textTransform: 'uppercase', marginBottom: '6px' }}>{key}</p>
                       {Array.isArray(val) ? (
                         <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '14px', color: 'var(--text-1)' }}>
                           {val.map((v, i) => <li key={i}>{String(v)}</li>)}
                         </ul>
                       ) : (
                         <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-1)' }}>{String(val || '')}</p>
                       )}
                     </div>
                   ))
                 )}
               </div>

               <div style={{ display: 'flex', gap: '8px' }}>
                 {searchResult.blobId && (
                   <a href={getWalrusScanUrl(searchResult.blobId)} target="_blank" rel="noopener noreferrer"
                     className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                     Walrus Scan ↗
                   </a>
                 )}
                 {searchResult.fields && (
                   <button className="btn btn-primary btn-sm" onClick={() => onSelectForm?.(searchResult as FormConfig)}>
                     Open in Builder
                   </button>
                 )}
               </div>
             </div>
          )}
        </div>
      )}

      {internalTab === 'replies' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {selectedFormId ? (
            <>
              {/* Form Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button className="btn btn-icon" onClick={() => setSelectedFormId(null)} title="Back to Manager">←</button>
                  <div>
                    <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{selectedForm?.title || 'Untitled Form'}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>{shorten(selectedFormId)} • {subs.filter(s => s.formId === selectedFormId).length} Replies</p>
                  </div>
                </div>
                
                {/* Search in Replies */}
                <div style={{ display: 'flex', gap: '8px', minWidth: '300px' }}>
                  <input
                    className="input"
                    placeholder="Filter by Submission ID..."
                    style={{ fontSize: '13px', height: '36px' }}
                    value={searchBlobId}
                    onChange={(e) => setSearchBlobId(e.target.value)}
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
                  <button 
                    key={s} 
                    className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setFilter(s)}
                    style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}
                  >
                    {s}
                    <span style={{ marginLeft: '6px', opacity: 0.6 }}>
                      ({s === 'all' ? subs.filter(x => x.formId === selectedFormId).length : subs.filter(x => x.formId === selectedFormId && x.status === s).length})
                    </span>
                  </button>
                ))}
              </div>

              {/* Submissions List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <AnimatePresence mode="popLayout">
                {subs
                  .filter(s => s.formId === selectedFormId)
                  .filter(s => filter === 'all' || s.status === filter)
                  .filter(s => !searchBlobId || s.id.includes(searchBlobId.trim()) || (s.blobId && s.blobId.includes(searchBlobId.trim())))
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map(s => (
                    <motion.div 
                      layout
                      key={s.id} 
                      className="card" 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
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
                      <span style={{ margin: '0 8px', opacity: 0.3 }}>-</span>
                      {new Date(s.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {s.formBlobId && (
                        <>
                          <span style={{ margin: '0 8px', opacity: 0.3 }}>-</span>
                          <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--text-3)' }}>
                            form: {s.formBlobId.slice(0,10)}-
                          </span>
                        </>
                      )}
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
                              <span style={{ color: v ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>{v ? 'Yes' : 'No'}</span>
                            ) : Array.isArray(v) ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {v.map((item, i) => {
                                  if (typeof item === 'string' && /^[A-Za-z0-9_-]{43,44}$/.test(item)) {
                                    return (
                                      <div key={i} style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', maxWidth: '200px', background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', minHeight: '120px' }}>
                                        <a href={getWalrusBlobUrl(item)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%' }}>
                                          <img 
                                            src={getWalrusBlobUrl(item)} 
                                            style={{ width: '100%', display: 'block', maxHeight: '180px', objectFit: 'cover' }} 
                                            onError={(e) => { 
                                              const img = e.currentTarget;
                                              img.style.display = 'none';
                                              const parent = img.parentElement;
                                              if (parent && !parent.querySelector('.img-error')) {
                                                const err = document.createElement('div');
                                                err.className = 'img-error';
                                                err.style.cssText = 'padding:20px; text-align:center; color:var(--text-3); font-size:11px;';
                                                err.innerHTML = 'Blob pending sync...<br/><br/><span style="color:var(--accent-2)">Click to try Walrus Scan ↗</span>';
                                                parent.appendChild(err);
                                              }
                                            }} 
                                          />
                                        </a>
                                      </div>
                                    );
                                  }
                                  return <span key={i} style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', fontSize: '12px' }}>{item}</span>;
                                })}
                              </div>
                            ) : v.toString().startsWith('http') ? (
                              <a href={v.toString()} target="_blank" rel="noopener noreferrer" className="link-premium">
                                {v.toString()} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4 }}><path d="M7 17L17 7M7 7h10v10"/></svg>
                              </a>
                            ) : (typeof v === 'string' && /^[A-Za-z0-9_-]{43,44}$/.test(v)) ? (
                              <div style={{ marginTop: '4px' }}>
                                <a href={getWalrusBlobUrl(v)} target="_blank" rel="noopener noreferrer" className="link-premium" style={{ marginBottom: '12px', display: 'inline-flex' }}>
                                  View Asset <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4 }}><path d="M7 17L17 7M7 7h10v10"/></svg>
                                </a>
                                <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', maxWidth: '300px' }}>
                                  <img src={getWalrusBlobUrl(v)} style={{ width: '100%', display: 'block', maxHeight: '300px', objectFit: 'contain' }} onError={(e) => e.currentTarget.parentElement!.style.display = 'none'} />
                                </div>
                              </div>
                            ) : (
                               <span style={{ fontWeight: 500 }}>{v.toString() || <em style={{ color: 'var(--text-3)', fontWeight: 400 }}>Empty</em>}</span>
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
                            Walrus Scan
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
                  ))}
                </AnimatePresence>

                {subs.filter(s => s.formId === selectedFormId).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-3)', border: '1px dashed var(--border)', borderRadius: '24px' }}>
                    <p style={{ fontSize: '15px' }}>No submissions found for this form yet.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '100px 40px', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: '48px', marginBottom: '24px' }}>📁</div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>Select a Form to View Replies</h3>
              <p style={{ color: 'var(--text-3)', maxWidth: '400px', margin: '0 auto 24px', fontSize: '14px', lineHeight: 1.6 }}>
                Go to the <strong>Manager</strong> tab and click on a form to see all of its associated submissions here.
              </p>
              <button className="btn btn-primary" onClick={() => setInternalTab('manager')}>Go to Manager</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

