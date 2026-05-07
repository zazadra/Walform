'use client';
import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { isAdmin, loadAdminConfig, saveAdminConfig, DEFAULT_CONFIG } from '@/lib/fields';
import type { FormConfig } from '@/types/motion';
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
    <div style={{ minHeight:'100dvh', backgroundColor:'var(--bg)', backgroundImage:'radial-gradient(ellipse 80% 35% at 50% 0%, rgba(124,58,237,0.1) 0%, transparent 60%)' }}>
      {/* Header */}
      <header style={{ position:'sticky', top:0, zIndex:40, borderBottom:'1px solid var(--border)', backdropFilter:'blur(16px)', background:'rgba(7,9,15,0.85)' }}>
        <div style={{ maxWidth:'1100px', margin:'0 auto', padding:'0 24px', height:'56px', display:'flex', alignItems:'center', gap:'16px' }}>
          <a href="/" style={{ display:'flex', alignItems:'center', gap:'8px', textDecoration:'none' }}>
            <svg width={22} height={22} viewBox="0 0 32 32" fill="none"><rect width={32} height={32} rx={8} fill="rgba(124,58,237,0.18)"/><path d="M10 22V14l6-4 6 4v8" stroke="#a78bfa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/><path d="M13 22v-5h6v5" stroke="#7c3aed" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{ fontSize:'15px', fontWeight:700, letterSpacing:'-0.03em' }}>Motion</span>
          </a>
          <span style={{ fontSize:'12px', padding:'3px 10px', borderRadius:'999px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'#f87171' }}>Admin</span>
          <div style={{ flex:1 }} />
          {/* Tabs */}
          <nav style={{ display:'flex', gap:'2px' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`btn btn-sm ${tab===t.key?'btn-primary':'btn-ghost'}`} style={{ fontSize:'13px', gap:'6px' }}>
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
          {/* Wallet */}
          <div style={{ position:'relative' }}>
            <button className="addr-chip" onClick={() => { navigator.clipboard.writeText(account.address); setCopied(true); setTimeout(()=>setCopied(false),1800); }}
              style={{ border:'none' }}>
              <span className="addr-dot anim-pulse" />
              <span className="mono">{shorten(account.address)}</span>
              {copied && <span style={{ fontSize:'10px', color:'#4ade80' }}>✓</span>}
            </button>
            <button onClick={() => disconnect()}
              style={{ marginLeft:'6px', fontSize:'11px', color:'var(--text-3)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', textUnderlineOffset:'2px' }}>
              Disconnect
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
