'use client';
import { useState, useEffect, Suspense } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { loadAdminConfig, saveAdminConfig, DEFAULT_CONFIG } from '@/lib/fields';
import type { FormConfig } from '@/types/walform';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const FormBuilderTab = dynamic(
  () => import('@/components/admin/FormBuilderTab').then(m => m.FormBuilderTab),
  { ssr: false }
);

function BuilderContent() {
  const account = useCurrentAccount();
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<FormConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    // Check for template preset
    const templateParam = searchParams.get('template');
    if (templateParam) {
      try {
        const preset = JSON.parse(decodeURIComponent(templateParam));
        setConfig({ ...DEFAULT_CONFIG, ...preset });
        return;
      } catch { /* use default */ }
    }
    const saved = loadAdminConfig();
    if (saved) {
      // Strip any stale platform-wide admins from a previous session.
      // Each publish will rebuild admins[] fresh from the co-admin input + publisher wallet.
      setConfig({ ...saved, admins: [] });
    }

  }, []);

  function handleChange(c: FormConfig) {
    setConfig(c);
    saveAdminConfig(c);
  }

  if (!account) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ padding: '40px', maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏗️</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>Connect to Build</h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24, lineHeight: 1.7 }}>
            Connect your Sui wallet to create and publish forms on Walrus.
          </p>
          <ConnectButton instance={dAppKit} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{ 
          display: 'inline-block', padding: '5px 12px', borderRadius: '10px',
          background: 'var(--accent-soft)', color: 'var(--accent-2)',
          fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.1em', marginBottom: 10
        }}>Form Studio</div>
        <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 6, lineHeight: 1.15 }}>
          Build Your <span className="text-glow-teal">Form</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-2)', maxWidth: 600, margin: '0 auto' }}>
          Design, configure, and publish your form to Walrus. Get a shareable link via your Sui object ID.
        </p>
      </div>
      <FormBuilderTab config={config} onChange={handleChange} ownerAddress={account.address} />
    </div>
  );
}

export default function BuilderPage() {
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: 'var(--bg)' }}>
      <Suspense fallback={
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)' }}>
          <span className="spinner" style={{ width: 20, height: 20 }} />Loading builder…
        </div>
      }>
        <BuilderContent />
      </Suspense>
    </div>
  );
}
