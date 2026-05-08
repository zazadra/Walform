'use client';
import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { loadAdminConfig, saveAdminConfig, DEFAULT_CONFIG } from '@/lib/fields';
import type { FormConfig } from '@/types/walform';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';

const FormBuilderTab = dynamic(() => import('@/components/admin/FormBuilderTab').then(m=>m.FormBuilderTab), { ssr:false });
const SubmissionsTab = dynamic(() => import('@/components/admin/SubmissionsTab').then(m=>m.SubmissionsTab), { ssr:false });
const MyFormsTab = dynamic(() => import('@/components/admin/MyFormsTab').then(m=>m.MyFormsTab), { ssr:false });
import { ToastContainer } from '@/components/ui/Toast';

type Tab = 'forms' | 'builder' | 'submissions';

function shorten(a: string) { return `${a.slice(0,6)}-${a.slice(-4)}`; }

export default function AdminPage() {
  const account = useCurrentAccount();
  const disconnect = () => dAppKit.disconnectWallet();
  const [tab, setTab]         = useState<Tab>('forms');
  const [config, setConfig]   = useState<FormConfig>(DEFAULT_CONFIG);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    const saved = loadAdminConfig();
    if (saved) setConfig(saved);
  }, []);

  function handleConfigChange(c: FormConfig) {
    setConfig(c);
    saveAdminConfig(c);
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key:'forms',       label:'My Forms',      icon:'📂' },
    { key:'builder',     label:'Form Builder',  icon:'🏗️' },
    { key:'submissions', label:'Submissions',   icon:'📥' },
  ];

  // -- Not connected --------------------------------------------
  if (!account) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)', backgroundImage:'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(124,58,237,0.12) 0%, transparent 60%)' }}>
      <div className="card" style={{ padding:'40px', maxWidth:'420px', width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🔐</div>
        <h1 style={{ fontSize:'22px', fontWeight:800, marginBottom:'8px', letterSpacing:'-0.02em' }}>Walform Console</h1>
        <p style={{ fontSize:'13px', color:'var(--text-2)', marginBottom:'8px', lineHeight:1.7 }}>
          Connect your wallet to access your personal form builder dashboard.
        </p>
        <p style={{ fontSize:'12px', color:'var(--text-3)', marginBottom:'28px', lineHeight:1.6, background:'rgba(124,58,237,0.06)', padding:'10px 14px', borderRadius:'10px', border:'1px solid rgba(124,58,237,0.12)' }}>
          💡 Any wallet can create and manage their own forms. Your data is private to your wallet.
        </p>
        <ConnectButton instance={dAppKit} />
      </div>
    </div>
  );

  // -- Admin dashboard - open to all wallets -----------------------------
  return (
    <div style={{ minHeight:'100dvh', backgroundColor:'var(--bg)', position: 'relative' }}>
      {/* Header */}
      <header style={{ position:'sticky', top:0, zIndex:100, borderBottom:'1px solid var(--border)', backdropFilter:'blur(24px)', background:'rgba(5,6,11,0.8)' }}>
        <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'0 24px', height:'64px', display:'flex', alignItems:'center', gap:'24px' }}>
          <a href="/" style={{ display:'flex', alignItems:'center', gap:'16px', textDecoration:'none' }}>
            <img src="/walform-mascot.png" alt="Walform Logo" style={{ width: '48px', height: 'auto', filter: 'drop-shadow(0 0 10px rgba(124,58,237,0.3))' }} />
            <span style={{ fontSize:'24px', fontWeight:900, letterSpacing:'-0.03em', color: '#fff' }}>Walform</span>
          </a>
          
          <div style={{ padding: '2px 10px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid var(--accent-soft)', color: 'var(--accent-2)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Console
          </div>

          <div style={{ flex:1 }} />
          
          {/* Tabs */}
          <nav style={{ display:'flex', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`btn btn-sm ${tab===t.key?'btn-primary':'btn-ghost'}`} 
                style={{ 
                  fontSize:'13px', 
                  gap:'8px', 
                  background: tab === t.key ? '' : 'transparent',
                  color: tab === t.key ? '#fff' : 'var(--text-2)',
                  borderRadius: '8px'
                }}>
                <span style={{ opacity: tab === t.key ? 1 : 0.7 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
          
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 8px' }} />

          {/* Wallet */}
          <div style={{ display:'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <button className="addr-chip" onClick={() => { navigator.clipboard.writeText(account.address); setCopied(true); setTimeout(()=>setCopied(false),1800); }}
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '10px' }}>
                <span className="addr-dot anim-pulse" style={{ width: '8px', height: '8px' }} />
                <span className="mono" style={{ color: 'var(--text-1)', fontSize: '14px', fontWeight: 600 }}>{shorten(account.address)}</span>
                {copied && <span style={{ fontSize:'12px', color:'var(--success)', fontWeight: 'bold', marginLeft: '6px' }}>✓</span>}
              </button>
            </div>
            <button onClick={() => disconnect()}
              style={{ fontSize:'14px', fontWeight: 600, color:'var(--text-3)', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', borderRadius: '10px', padding: '8px 16px', cursor:'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth:'1100px', margin:'0 auto', padding:'32px 24px' }}>
        <motion.div key={tab} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.25 }}>
          {tab === 'forms'       && <MyFormsTab ownerAddress={account.address} onSelectForm={(f) => { handleConfigChange(f); setTab('builder'); }} />}
          {tab === 'builder'     && <FormBuilderTab config={config} onChange={handleConfigChange} ownerAddress={account.address} />}
          {tab === 'submissions' && <SubmissionsTab ownerAddress={account.address} formBlobId={config.publishedBlobId} />}
        </motion.div>
      </main>
      <ToastContainer />
    </div>
  );
}
