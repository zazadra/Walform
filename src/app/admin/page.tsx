'use client';
import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { isAdmin, loadAdminConfig, saveAdminConfig, DEFAULT_CONFIG } from '@/lib/fields';
import type { FormConfig } from '@/types/walform';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';

const FormBuilderTab = dynamic(() => import('@/components/admin/FormBuilderTab').then(m=>m.FormBuilderTab), { ssr:false });
const SubmissionsTab = dynamic(() => import('@/components/admin/SubmissionsTab').then(m=>m.SubmissionsTab), { ssr:false });
const AdminsTab      = dynamic(() => import('@/components/admin/AdminsTab').then(m=>m.AdminsTab), { ssr:false });

type Tab = 'builder' | 'submissions' | 'admins';

function shorten(a: string) { return `${a.slice(0,6)}…${a.slice(-4)}`; }

export default function AdminPage() {
  const account = useCurrentAccount();
  const disconnect = () => dAppKit.disconnectWallet();
  const [tab, setTab]         = useState<Tab>('builder');
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
    { key:'builder',     label:'Form Builder',  icon:'⊞' },
    { key:'submissions', label:'Submissions',   icon:'📋' },
    { key:'admins',      label:'Admins',        icon:'🔐' },
  ];

  // ── Not connected ────────────────────────────────────────────
  if (!account) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)', backgroundImage:'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(124,58,237,0.12) 0%, transparent 60%)' }}>
      <div className="card" style={{ padding:'40px', maxWidth:'400px', width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:'40px', marginBottom:'16px' }}>🔐</div>
        <h1 style={{ fontSize:'20px', fontWeight:700, marginBottom:'8px' }}>Admin Panel</h1>
        <p style={{ fontSize:'13px', color:'var(--text-2)', marginBottom:'24px', lineHeight:1.6 }}>Connect your wallet to access the admin dashboard.</p>
        <ConnectButton instance={dAppKit} />
      </div>
    </div>
  );

  // ── Not admin ───────────────────────────────────────────────
  if (!isAdmin(account.address)) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div className="card" style={{ padding:'40px', maxWidth:'400px', width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:'40px', marginBottom:'16px' }}>⛔</div>
        <h1 style={{ fontSize:'20px', fontWeight:700, marginBottom:'8px' }}>Access Denied</h1>
        <p style={{ fontSize:'13px', color:'var(--text-2)', marginBottom:'24px', lineHeight:1.6 }}>
          Your address is not authorized.<br/>
          <span style={{ fontFamily:'var(--mono)', fontSize:'11px', color:'var(--text-3)' }}>{account.address}</span>
        </p>
        <button className="btn btn-secondary" onClick={() => disconnect()}>Disconnect</button>
      </div>
    </div>
  );

  // ── Admin dashboard ─────────────────────────────────────────
  return (
    <div style={{ minHeight:'100dvh', backgroundColor:'var(--bg)', position: 'relative' }}>
      {/* Header */}
      <header style={{ position:'sticky', top:0, zIndex:100, borderBottom:'1px solid var(--border)', backdropFilter:'blur(24px)', background:'rgba(5,6,11,0.8)' }}>
        <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'0 24px', height:'64px', display:'flex', alignItems:'center', gap:'24px' }}>
          <a href="/" style={{ display:'flex', alignItems:'center', gap:'12px', textDecoration:'none' }}>
            <img src="/walform-mascot.png" alt="Walform Logo" style={{ width: '36px', height: 'auto', filter: 'drop-shadow(0 0 10px rgba(124,58,237,0.3))' }} />
            <span style={{ fontSize:'18px', fontWeight:900, letterSpacing:'-0.03em', color: '#fff' }}>Walform</span>
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
          <div style={{ display:'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <button className="addr-chip" onClick={() => { navigator.clipboard.writeText(account.address); setCopied(true); setTimeout(()=>setCopied(false),1800); }}
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '6px 12px' }}>
                <span className="addr-dot anim-pulse" />
                <span className="mono" style={{ color: 'var(--text-1)' }}>{shorten(account.address)}</span>
                {copied && <span style={{ fontSize:'10px', color:'var(--success)' }}>✓</span>}
              </button>
            </div>
            <button onClick={() => disconnect()}
              style={{ fontSize:'12px', fontWeight: 600, color:'var(--text-3)', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', cursor:'pointer', transition: 'all 0.2s' }}
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
          {tab === 'builder'     && <FormBuilderTab config={config} onChange={handleConfigChange} />}
          {tab === 'submissions' && <SubmissionsTab formBlobId={config.publishedBlobId ?? 'default'} />}
          {tab === 'admins'      && <AdminsTab />}
        </motion.div>
      </main>
    </div>
  );
}
