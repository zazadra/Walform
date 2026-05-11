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
      const { WALFORM_PACKAGE_ID } = await import('@/lib/walrus-onchain');
      const { getSuiNativeForms } = await import('@/lib/registry');
      
      let chainBlobIds: string[] = [];
      
      if (WALFORM_PACKAGE_ID !== '0x0') {
        console.log('[Sync] Discovering forms via Sui Native...');
        chainBlobIds = await getSuiNativeForms(ownerAddress, WALFORM_PACKAGE_ID);
      } else {
        console.log('[Sync] Falling back to blob scan (Legacy)...');
        const { forms: legacyForms } = await scanOwnedBlobs(ownerAddress);
        chainBlobIds = legacyForms.map(f => f.publishedBlobId || f.id).filter(Boolean) as string[];
      }

      if (chainBlobIds.length > 0) {
        const results = await Promise.allSettled(
          chainBlobIds.map(id =>
            readJsonFromWalrus<FormConfig>(id)
              .then(cfg => ({ ...cfg, publishedBlobId: cfg.publishedBlobId ?? id }))
          )
        );
        const loaded = results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<FormConfig>).value)
          .filter(cfg => cfg && Array.isArray(cfg.fields));

        setForms(prev => {
          const combined = [...loaded, ...prev];
          const seen = new Set<string>();
          return combined.filter(f => {
            const id = f.publishedBlobId || f.id;
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        });
      }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '4px' }}>My Forms</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-2)' }}>Forms you've published, stored by this browser.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ gap: '8px', display: 'flex', alignItems: 'center' }}
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? <span className="spinner" style={{ width: '12px', height: '12px' }} /> : '🔄'}
            Sync from Chain
          </button>
          <BlobIdImporter onImport={handleImported} />
        </div>
      </div>

      {/* Info banner */}
      <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6 }}>
        <strong style={{ color: '#fbbf24' }}>ℹ How this works:</strong> Forms you publish via Form Builder are automatically saved here. If you open Walform in a different browser or cleared localStorage, use <strong>Import Blob ID</strong> above to reload them.
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="card" style={{ padding: '20px', height: '140px', background: 'rgba(255,255,255,0.02)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : forms.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📋</div>
          <p style={{ color: 'var(--text-1)', fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>No forms found</p>
          <p style={{ color: 'var(--text-3)', fontSize: '14px', maxWidth: '360px', margin: '0 auto' }}>
            Publish a form from the <strong>Form Builder</strong> tab, or use <strong>Import Blob ID</strong> above to load an existing form by its Blob ID.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {forms.map(f => (
            <div
              key={f.publishedBlobId ?? f.id}
              className="card"
              style={{ padding: '20px', transition: 'all 0.2s', border: '1px solid var(--border)', position: 'relative' }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = 'var(--accent-2)';
                e.currentTarget.style.boxShadow = '0 8px 24px -10px rgba(139,92,246,0.2)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Archive button */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  if (confirm('Archive this form? It will no longer appear here, but is still on Walrus.')) {
                    handleArchive(f);
                  }
                }}
                title="Archive Form"
                style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px', opacity: 0.6, transition: 'opacity 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>

              {/* Form icon */}
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', marginBottom: '14px' }}>
                📝
              </div>

              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-1)', paddingRight: '24px' }}>{f.title || 'Untitled Form'}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '14px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                {f.description || 'No description provided.'}
              </p>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px', fontWeight: 700 }}>
                <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-2)' }}>
                  {f.fields?.length || 0} Fields
                </span>
                {f.encryptionEnabled && (
                  <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'rgba(74, 222, 128, 0.1)', color: 'var(--success)', border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                    🔒 Encrypted
                  </span>
                )}
                {f.publishedBlobId && (
                  <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: '10px' }}>
                    {f.publishedBlobId.slice(0, 10)}…
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, fontSize: '11px', padding: '6px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectSubmissions && f.publishedBlobId) {
                      onSelectSubmissions(f.publishedBlobId);
                    }
                  }}
                >
                  View Submissions
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, fontSize: '11px', padding: '6px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectForm(f);
                  }}
                >
                  Edit Form
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
