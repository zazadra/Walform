'use client';
import { useState, useEffect } from 'react';
import type { FormConfig } from '@/types/walform';
import { getCachedFormIds, getArchivedFormIds, archiveForm } from '@/lib/form-registry';
import { readJsonFromWalrus } from '@/lib/walrus';
import { scanOwnedBlobs } from '@/lib/form-registry';

function BlobIdImporter({ onImport }: { onImport: (cfg: FormConfig) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleImport() {
    const id = input.trim();
    if (!id) { setErr('Please enter a Blob ID.'); return; }
    setLoading(true); setErr('');
    try {
      const cfg = await readJsonFromWalrus<FormConfig>(id);
      if (!cfg || !Array.isArray(cfg.fields)) throw new Error('Not a valid Walform config.');
      cfg.publishedBlobId = cfg.publishedBlobId ?? id;
      onImport(cfg);
      setOpen(false); setInput('');
    } catch (e: any) {
      setErr(e.message || 'Failed to load blob.');
    }
    setLoading(false);
  }

  if (!open) return (
    <button
      className="btn btn-secondary btn-sm"
      style={{ gap: '8px', display: 'flex', alignItems: 'center' }}
      onClick={() => setOpen(true)}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Import Blob ID
    </button>
  );

  return (
    <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.05)', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-2)' }}>Import Form by Blob ID</p>
      <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>Paste a Walrus Blob ID to load and manage any form.</p>
      <input
        className="input"
        placeholder="e.g. abc123XYZ..."
        value={input}
        onChange={e => { setInput(e.target.value); setErr(''); }}
        onKeyDown={e => e.key === 'Enter' && handleImport()}
        autoFocus
      />
      {err && <p style={{ fontSize: '12px', color: 'var(--error)' }}>⚠ {err}</p>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleImport} disabled={loading}>
          {loading ? <><span className="spinner" style={{ width: '12px', height: '12px' }} /> Loading...</> : 'Load Form'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setInput(''); setErr(''); }}>Cancel</button>
      </div>
    </div>
  );
}

export function MyFormsTab({
  ownerAddress,
  onSelectForm,
  onSelectSubmissions
}: {
  ownerAddress: string;
  onSelectForm: (formConfig: FormConfig) => void;
  onSelectSubmissions?: (formBlobId: string) => void;
}) {
  const [forms, setForms] = useState<FormConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSync() {
    if (!ownerAddress) return;
    setIsSyncing(true);
    try {
      const allBlobIds = new Set<string>();

      // 1. PRIMARY: Server-side registry
      try {
        const res = await fetch(`/api/registry/forms?owner=${encodeURIComponent(ownerAddress)}`);
        const data = await res.json() as { formBlobIds?: string[] };
        (data.formBlobIds ?? []).forEach(id => allBlobIds.add(id));
        console.log(`[MyForms] Server registry: ${allBlobIds.size} forms`);
      } catch (e) {
        console.warn('[MyForms] Server registry unavailable:', e);
      }

      // 2. FALLBACK: localStorage cache
      getCachedFormIds(ownerAddress).forEach(id => allBlobIds.add(id));

      let chainForms: FormConfig[] = [];

      // 3. On-chain scan
      if (allBlobIds.size === 0) {
        const { WALFORM_PACKAGE_ID, getOwnedForms } = await import('@/lib/walrus-onchain');
        if (WALFORM_PACKAGE_ID !== '0x0') {
          console.log('[Sync] Discovering forms via Sui Native...');
          try {
            const nativeForms = await getOwnedForms(ownerAddress);
            chainForms = nativeForms.map((nf: any) => {
              try {
                const parsed = JSON.parse(nf.configJson);
                return { ...parsed, publishedSuiObjectId: nf.suiObjectId };
              } catch (e) {
                return null;
              }
            }).filter(Boolean) as FormConfig[];
            console.log(`[Sync] Found ${chainForms.length} native Sui forms.`);
          } catch (e) {
            console.error('[Sync] Error getting native forms:', e);
          }
        } else {
          console.log('[Sync] Falling back to blob scan (Legacy)...');
          const { scanOwnedBlobs } = await import('@/lib/form-registry');
          const { forms: legacyForms } = await scanOwnedBlobs(ownerAddress);
          legacyForms.map(f => f.publishedBlobId || f.id).filter(Boolean).forEach(id => allBlobIds.add(id!));
        }
      }

      const chainBlobIds = [...allBlobIds];
      let loaded: FormConfig[] = [];

      if (chainBlobIds.length > 0) {
        const results = await Promise.allSettled(
          chainBlobIds.map(id =>
            readJsonFromWalrus<FormConfig>(id)
              .then(cfg => ({ ...cfg, publishedBlobId: cfg.publishedBlobId ?? id }))
          )
        );
        loaded = results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<FormConfig>).value)
          .filter(cfg => cfg && Array.isArray(cfg.fields));
      }

      setForms(prev => {
        const combined = [...chainForms, ...loaded, ...prev];
        const seen = new Set<string>();
        return combined.filter(f => {
          // Use publishedSuiObjectId as the primary unique key for Sui-native forms, fallback to publishedBlobId/id
          const id = f.publishedSuiObjectId || f.publishedBlobId || f.id;
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      });
    } catch (e) {
      console.error('Sync failed:', e);
    }
    setIsSyncing(false);
  }

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const cachedIds = getCachedFormIds(ownerAddress);
      const archivedIds = getArchivedFormIds(ownerAddress);
      const visibleIds = cachedIds.filter(id => !archivedIds.includes(id));

      if (visibleIds.length > 0) {
        const results = await Promise.allSettled(
          visibleIds.map(id =>
            readJsonFromWalrus<FormConfig>(id)
              .then(cfg => ({ ...cfg, publishedBlobId: cfg.publishedBlobId ?? id }))
          )
        );
        const loaded = results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<FormConfig>).value)
          .filter(cfg => cfg && Array.isArray(cfg.fields));
        setForms(loaded);
      }
      setIsLoading(false);
      // Auto-sync in the background to catch forms published from other devices
      // or forms missing from cache.
      handleSync();
    }
    if (ownerAddress) load();
  }, [ownerAddress]);

  function handleImported(cfg: FormConfig) {
    setForms(prev => {
      const id = cfg.publishedBlobId ?? '';
      if (prev.some(f => (f.publishedBlobId ?? '') === id)) return prev;
      return [cfg, ...prev];
    });
    onSelectForm(cfg);
  }

  const handleArchive = (form: FormConfig) => {
    const blobId = form.publishedBlobId || form.id;
    if (blobId) {
      archiveForm(ownerAddress, blobId);
      setForms(prev => prev.filter(f => (f.publishedBlobId || f.id) !== blobId));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '4px', background: 'linear-gradient(to bottom right, #fff, var(--text-3))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>My Forms</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-3)' }}>Manage your decentralized forms and collect responses.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ height: 36, gap: '8px', display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)' }}
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? <span className="spinner" style={{ width: '12px', height: '12px' }} /> : '🔄'}
            <span style={{ fontSize: 13, fontWeight: 700 }}>Sync Chain</span>
          </button>
          <BlobIdImporter onImport={handleImported} />
        </div>
      </div>



      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card-premium skeleton" style={{ height: '180px' }} />
          ))}
        </div>
      ) : forms.length === 0 ? (
        <div style={{ padding: '80px 20px', textAlign: 'center', background: 'var(--surface-1)', borderRadius: '24px', border: '1px dashed var(--border)', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.2)' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>📋</div>
          <p style={{ color: 'var(--text-1)', fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>No forms found</p>
          <p style={{ color: 'var(--text-3)', fontSize: '14px', maxWidth: '380px', margin: '0 auto' }}>
            Ready to build? Create your first form in the builder or import an existing one.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {forms.map(f => (
            <div
              key={f.publishedBlobId ?? f.id}
              className="card-premium"
              style={{ 
                padding: '24px', 
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 200,
                justifyContent: 'space-between'
              }}
              onClick={() => onSelectForm(f)}
            >
              {/* Top Row: Icon & Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ 
                  width: '44px', 
                  height: '44px', 
                  borderRadius: '12px', 
                  background: 'var(--surface-3)', 
                  border: '1px solid var(--border-2)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '20px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}>
                  {f.fields?.some(fi => fi.type === 'file') ? '📎' : '📄'}
                </div>
                
                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (confirm('Archive this form?')) handleArchive(f);
                  }}
                  className="btn-icon"
                  style={{ color: 'var(--text-3)', opacity: 0.5 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>

              {/* Middle: Content */}
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px', color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
                  {f.title || 'Untitled Form'}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                  {f.description || 'No description provided.'}
                </p>
              </div>

              {/* Bottom: Meta Tags */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span className="badge-premium" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent-2)' }}>
                    {f.fields?.length || 0} Fields
                  </span>
                  {f.encryptionEnabled && (
                    <span className="badge-premium" style={{ background: 'rgba(74,222,128,0.05)', color: 'var(--success)', border: '1px solid rgba(74,222,128,0.1)' }}>
                      🔒 Encrypted
                    </span>
                  )}
                </div>
                
                {onSelectSubmissions && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSubmissions(f.publishedBlobId || f.id || '');
                    }}
                    className="btn btn-ghost btn-sm" 
                    style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-2)', height: 28, padding: '0 8px' }}
                  >
                    Results →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
