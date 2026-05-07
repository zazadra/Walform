'use client';
import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { readJsonFromWalrus, getWalrusScanUrl } from '@/lib/walrus';
import { uploadOnChain, uploadJsonOnChain } from '@/lib/walrus-onchain';
import { addSubId, DEFAULT_CONFIG } from '@/lib/fields';
import { publishSubmission } from '@/lib/submission-index';
import type { FormConfig, SessionField, Submission } from '@/types/motion';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const ClientOnly = dynamic(() => Promise.resolve(({ children }: { children: React.ReactNode }) => <>{children}</>), { ssr: false });

function uid() { return Math.random().toString(36).slice(2, 10); }
function shorten(a: string) { return `${a.slice(0,6)}…${a.slice(-4)}`; }

// ── Single field renderer ──────────────────────────────────────────
function FieldInput({ field, value, onChange, onFile, uploading }: {
  field: SessionField;
  value: string | string[] | boolean;
  onChange: (v: string | string[] | boolean) => void;
  onFile: (f: File) => Promise<void>;
  uploading: boolean;
}) {
  const base = value as string;
  switch (field.type) {
    case 'text':
    case 'email':
      return <input type={field.type} className="input" placeholder={field.placeholder} value={base||''} onChange={e=>onChange(e.target.value)} />;
    case 'url':
      return <input type="url" className="input" placeholder={field.placeholder||'https://'} value={base||''} onChange={e=>onChange(e.target.value)} />;
    case 'textarea':
      return <textarea className="textarea" placeholder={field.placeholder} rows={4} value={base||''} onChange={e=>onChange(e.target.value)} />;
    case 'select':
      return (
        <select className="select" value={base||''} onChange={e=>onChange(e.target.value)} style={{ background:'var(--card)', color:'var(--text-1)' }}>
          <option value="">Select…</option>
          {field.options?.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'checkbox':
      return (
        <label style={{ display:'flex', alignItems:'flex-start', gap:'10px', cursor:'pointer', fontSize:'14px', color:'var(--text-2)' }}>
          <input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked)}
            style={{ width:'16px', height:'16px', accentColor:'var(--accent)', cursor:'pointer', marginTop:'2px', flexShrink:0 }} />
          <span>{field.label}{field.linkUrl && <> · <a href={field.linkUrl} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent-2)'}}>{field.linkText||field.linkUrl}</a></>}</span>
        </label>
      );
    case 'file':
      return (
        <div 
          onClick={() => {
            const input = document.getElementById(`file-input-${field.id}`);
            if (input) (input as HTMLInputElement).click();
          }}
          style={{ 
            display:'flex', alignItems:'center', gap:'10px', padding:'14px', borderRadius:'10px', 
            border:'1px dashed var(--border)', cursor:'pointer', background:'rgba(255,255,255,0.02)', 
            fontSize:'13px', color:'var(--text-3)', transition:'all 0.15s' 
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <input 
            id={`file-input-${field.id}`}
            type="file" 
            accept="image/*,video/*,.pdf,.doc,.docx" 
            style={{ display:'none' }} 
            onChange={async e => { 
              const f = e.target.files?.[0]; 
              if (f) {
                e.stopPropagation();
                await onFile(f); 
              }
            }} 
          />
          {uploading ? <><span className="spinner"/> Uploading to Walrus…</>
           : base ? <span style={{color:'#4ade80'}}>✓ Uploaded — click to replace</span>
           : <>📎 Click or drop file</>}
        </div>
      );
    default: return null;
  }
}

// ── Reference Link ────────────────────────────────────────────────
function ReferenceLink({ href, label }: { href: string; label: string }) {
  return (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer" 
      style={{ 
        color: 'var(--text-2)', 
        textDecoration: 'none', 
        fontSize: '14px', 
        fontWeight: 500, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderRadius: '10px',
        transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.03)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(124,58,237,0.08)';
        e.currentTarget.style.borderColor = 'rgba(124,58,237,0.2)';
        e.currentTarget.style.color = '#fff';
        const arrow = e.currentTarget.querySelector('.arrow');
        if (arrow) (arrow as HTMLElement).style.transform = 'translateX(4px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.03)';
        e.currentTarget.style.color = 'var(--text-2)';
        const arrow = e.currentTarget.querySelector('.arrow');
        if (arrow) (arrow as HTMLElement).style.transform = 'translateX(0)';
      }}
    >
      {label}
      <span className="arrow" style={{ color: 'var(--text-3)', fontSize: '12px', transition: 'transform 0.2s' }}>→</span>
    </a>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function Home() {
  const account = useCurrentAccount();
  const disconnect = () => dAppKit.disconnectWallet();
  const address = account?.address;

  const [config, setConfig]     = useState<FormConfig>(DEFAULT_CONFIG);
  const [formBlobId, setFormBlobId] = useState<string>('default');
  const [configLoading, setConfigLoading] = useState(true);

  const [data, setData]         = useState<Record<string, string|string[]|boolean>>({});
  const [fileUploading, setFileUploading] = useState<Record<string,boolean>>({});
  const [errors, setErrors]     = useState<Record<string,string>>({});

  const [status, setStatus]     = useState<'idle'|'signing'|'submitting'|'success'|'error'>('idle');
  const [submittedBlobId, setSubmittedBlobId] = useState('');
  const [errMsg, setErrMsg]     = useState('');
  const [wCopied, setWCopied]   = useState(false);

  // Load form config from ?form=blobId
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fid = params.get('form');
    if (!fid) { setConfigLoading(false); return; }
    setFormBlobId(fid);
    readJsonFromWalrus<FormConfig>(fid)
      .then(cfg => setConfig(cfg))
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, []);

  function setField(id: string, v: string|string[]|boolean) {
    setData(d => ({ ...d, [id]: v }));
    setErrors(e => { const n={...e}; delete n[id]; return n; });
  }

  async function handleFile(fieldId: string, file: File) {
    if (!address) {
      setErrors(e => ({ ...e, [fieldId]: 'Please connect your wallet first to upload files.' }));
      return;
    }
    setFileUploading(u => ({ ...u, [fieldId]: true }));
    try {
      const { blobId } = await uploadOnChain(file, address);
      setField(fieldId, blobId);
    } catch (err: any) { 
      setErrors(e => ({ ...e, [fieldId]: err.message || 'File upload failed — try again.' })); 
    }
    setFileUploading(u => ({ ...u, [fieldId]: false }));
  }

  function validate(): boolean {
    const errs: Record<string,string> = {};
    config.fields.filter(f=>f.enabled&&f.required).forEach(f => {
      const v = data[f.id];
      const empty = v===undefined||v===''||v===false||(Array.isArray(v)&&v.length===0);
      if (empty) errs[f.id] = 'This field is required.';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    if (!address) {
      setStatus('idle');
      setErrMsg('Wallet not connected. Please connect your wallet to submit.');
      return;
    }

    setStatus('submitting');
    try {
      const submission: Submission = {
        id: uid(), 
        formId: formBlobId, // Mandatory for Bug #1
        formBlobId, 
        data,
        submitterAddress: address,
        timestamp: Date.now(), 
        status: 'pending',
      };

      console.log("FORM ID:", formBlobId);
      console.log("SUBMISSION:", submission);

      // Step 1: Upload submission data to Walrus via on-chain certification
      // Priority for targetOwner:
      // 1. config.publishedBy (the person who created the form)
      // 2. Current address (if they are in the admins list)
      // 3. First admin in the list
      let targetOwner = config.publishedBy;
      if (!targetOwner) {
        if (config.admins?.some(a => a.toLowerCase() === address.toLowerCase())) {
          targetOwner = address;
        } else if (config.admins && config.admins.length > 0) {
          targetOwner = config.admins[0];
        } else {
          targetOwner = address;
        }
      }

      const result = await uploadJsonOnChain(submission, address, 1, targetOwner);
      const { blobId } = result;
      submission.blobId = blobId;
      console.log("UPLOAD RESULT:", result);

      // Step 2: Persist blobId locally + broadcast to admin tabs instantly
      addSubId(formBlobId, blobId);
      publishSubmission(blobId, formBlobId);

      setSubmittedBlobId(blobId);
      setStatus('success');
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Upload failed.');
      setStatus('error');
    }

  }

  const enabledFields = config.fields.filter(f => f.enabled);

  // ── Loading ──────────────────────────────────────────────────
  if (configLoading) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', color:'var(--text-3)', gap:'10px' }}>
      <span className="spinner" style={{width:'20px',height:'20px'}}/> Loading form…
    </div>
  );

  // ── No form ──────────────────────────────────────────────────
  if (!new URLSearchParams(window.location.search).get('form') && formBlobId === 'default') {
    return (
      <div style={{ minHeight:'100dvh', backgroundColor:'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding:'32px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', maxWidth:'1200px', margin:'0 auto', width:'100%', zIndex: 10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--accent-shadow)', position: 'relative', overflow: 'hidden' }}>
              {/* COMBINED WALRUS + SUI LOGO */}
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                {/* Sui Drop */}
                <path d="M12 21C12 21 6 14 6 9.5C6 6.5 8.7 4 12 4C15.3 4 18 6.5 18 9.5C18 14 12 21 12 21Z" fill="white" fillOpacity="0.2" />
                <path d="M12 19C12 19 8 13.5 8 9.5C8 7.5 9.8 6 12 6C14.2 6 16 7.5 16 9.5C16 13.5 12 19 12 19Z" fill="white" />
                {/* Walrus Wave Base */}
                <path d="M4 17C6 19 9 19 12 17C15 15 18 15 20 17" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', animation: 'logo-shimmer 2.5s infinite ease-in-out' }} />
            </div>
            <span style={{ fontSize:'22px', fontWeight:900, letterSpacing:'-0.05em', background: 'linear-gradient(to bottom, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Motion</span>
          </div>
          <div style={{ display:'flex', gap:'16px' }}>
            <a href="/admin" className="btn btn-secondary btn-sm">Sign In</a>
            <a href="/admin" className="btn btn-primary btn-sm">Get Started</a>
          </div>
        </header>

        <main style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'80px 24px', textAlign:'center', position: 'relative' }}>
          <motion.div 
            initial={{opacity:0, y:30}} 
            animate={{opacity:1, y:0}} 
            transition={{duration:0.8, ease:[0.16,1,0.3,1]}}
            style={{ maxWidth: '900px', zIndex: 5 }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px', background: 'var(--accent-soft)', border: '1px solid var(--accent-glow)', marginBottom: '32px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-2)', boxShadow: '0 0 8px var(--accent-2)' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Powered by Walrus & Sui</span>
            </div>
            
            <h1 style={{ fontSize:'clamp(48px, 8vw, 84px)', fontWeight:900, letterSpacing:'-0.05em', lineHeight:0.95, marginBottom:'32px', color: '#fff' }}>
              Decentralized forms<br/>
              <span style={{ background: 'linear-gradient(135deg, var(--accent-2) 0%, var(--cyan) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>owned by you.</span>
            </h1>
            
            <p style={{ fontSize:'clamp(16px, 4vw, 20px)', color:'var(--text-2)', lineHeight:1.6, maxWidth:'640px', margin:'0 auto 56px', fontWeight: 500 }}>
              Motion lets you create forms, surveys, and applications that store data 100% on-chain. No tracking, no middleman, total sovereignty.
            </p>
            
            <div style={{ display:'flex', gap:'20px', justifyContent:'center', flexWrap: 'wrap' }}>
              <a href="/admin" className="btn btn-primary btn-xl" style={{ textDecoration:'none', minWidth: '240px' }}>
                Start Building Free
              </a>
              <a href="https://walrus.space" target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-xl" style={{ textDecoration:'none', minWidth: '240px' }}>
                How it Works
              </a>
            </div>
          </motion.div>

          {/* Floating decorative elements */}
          <motion.div 
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: 'absolute', top: '20%', right: '10%', width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)', filter: 'blur(40px)', zIndex: 1 }}
          />

          {/* ── PART 1: MOTION EXPLANATION ────────────────────────────────── */}
          <section style={{ width: '100%', maxWidth: '1200px', margin: '160px auto 0', padding: '0 24px', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, var(--accent-soft), transparent 70%)', opacity: 0.5, filter: 'blur(60px)', zIndex: 0 }} />
            
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              style={{ position: 'relative', zIndex: 2 }}
            >
              <h2 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '24px' }}>
                Forms owned by users,<br/>
                <span style={{ color: 'var(--accent-2)' }}>not platforms.</span>
              </h2>
              <p style={{ fontSize: '20px', color: 'var(--text-2)', maxWidth: '700px', margin: '0 auto 48px', lineHeight: 1.6 }}>
                Motion is a decentralized form ecosystem built on Walrus and Sui where submissions, media, and workflows live fully on-chain. No centralized database. No hidden control. Full ownership by default.
              </p>
              
              <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {['Secure', 'Permanent', 'Composable', 'Censorship-Resistant'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-3)', fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-2)' }} />
                    {item}
                  </div>
                ))}
              </div>
            </motion.div>
          </section>

          {/* ── PART 2: FLOW SECTION ──────────────────────────────────────── */}
          <section style={{ width: '100%', maxWidth: '1000px', margin: '200px auto 0', padding: '0 24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent-2)', marginBottom: '64px' }}>How it works</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px', position: 'relative' }}>
              {[
                { title: 'Connect', desc: 'Authenticate instantly using Sui wallets.', icon: '🔑' },
                { title: 'Build', desc: 'Create forms, surveys, and applications with flexible customization.', icon: '🛠️' },
                { title: 'Store', desc: 'All submissions and media are stored permanently on Walrus.', icon: '📦' },
                { title: 'Analyze', desc: 'Review submissions, manage admins, and export insights seamlessly.', icon: '📊' }
              ].map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2, duration: 0.6 }}
                  style={{ 
                    padding: '32px', 
                    borderRadius: '24px', 
                    background: 'rgba(255,255,255,0.03)', 
                    border: '1px solid var(--border)',
                    textAlign: 'left',
                    position: 'relative'
                  }}
                >
                  <div style={{ fontSize: '32px', marginBottom: '24px' }}>{step.icon}</div>
                  <h4 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>{step.title}</h4>
                  <p style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.5 }}>{step.desc}</p>
                  
                  {i < 3 && (
                    <div style={{ 
                      position: 'absolute', 
                      right: '-24px', 
                      top: '50%', 
                      transform: 'translateY(-50%)', 
                      zIndex: 10,
                      opacity: 0.5,
                      animation: 'arrow-flow 2s infinite ease-in-out',
                      animationDelay: `${i * 0.5}s`,
                      fontSize: '24px',
                      color: 'var(--accent-2)',
                      display: 'block' // Ensure it shows for grid
                    }}>
                      →
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── PART 3: UNIQUENESS / ADVANTAGES ────────────────────────────── */}
          <section style={{ width: '100%', maxWidth: '1200px', margin: '200px auto 0', padding: '0 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
              {[
                { title: '100% On-Chain', desc: 'Forms, submissions, and media are stored natively on decentralized infrastructure without relying on centralized databases.', icon: '⚡' },
                { title: 'Walrus Durability', desc: 'Powered by Walrus for resilient, permanent, and scalable decentralized storage.', icon: '🌊' },
                { title: 'Sui Performance', desc: 'Built on Sui for fast interactions, smooth wallet UX, and scalable Web3 experiences.', icon: '💧' }
              ].map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  whileHover={{ y: -8, transition: { duration: 0.2 } }}
                  style={{
                    padding: '48px',
                    borderRadius: '32px',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
                    border: '1px solid var(--border)',
                    textAlign: 'left',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                    backdropFilter: 'blur(10px)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, transparent, var(--accent-2), transparent)' }} />
                  <div style={{ fontSize: '40px', marginBottom: '32px', display: 'inline-flex', width: 64, height: 64, background: 'rgba(255,255,255,0.05)', borderRadius: '16px', alignItems: 'center', justifyContent: 'center' }}>
                    {card.icon}
                  </div>
                  <h4 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '16px' }}>{card.title}</h4>
                  <p style={{ fontSize: '16px', color: 'var(--text-2)', lineHeight: 1.6 }}>{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </section>
          {/* OFFICIAL REFERENCES */}
          <section style={{ 
            marginTop: '120px', 
            padding: '100px 24px', 
            borderTop: '1px solid var(--border)', 
            maxWidth: '940px', 
            margin: '120px auto 0', 
            position: 'relative', 
            zIndex: 10
          }}>
            {/* Subtle background glow */}
            <div style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: '100%', height: '400px', background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.06) 0%, transparent 70%)', zIndex: -1, pointerEvents: 'none' }} />
            
            <div style={{ textAlign: 'center', marginBottom: '64px' }}>
              <motion.h2 
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                style={{ 
                  fontSize: '28px', 
                  fontWeight: 900, 
                  letterSpacing: '-0.03em', 
                  background: 'linear-gradient(to bottom, #fff, #a1a1aa)', 
                  WebkitBackgroundClip: 'text', 
                  WebkitTextFillColor: 'transparent',
                  marginBottom: '12px'
                }}
              >
                Official References
              </motion.h2>
              <motion.p 
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                style={{ fontSize: '15px', color: 'var(--text-3)', fontWeight: 500 }}
              >
                Learn more about the ecosystem powering Motion.
              </motion.p>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
              gap: '24px',
              justifyContent: 'center'
            }}>
              {/* Walrus Card */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                whileInView={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -4, borderColor: 'rgba(124,58,237,0.25)', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.6), 0 0 20px rgba(124,58,237,0.08)' }}
                viewport={{ once: true }}
                className="card" 
                style={{ 
                  padding: '28px', 
                  textAlign: 'left',
                  background: 'rgba(23, 23, 23, 0.4)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '24px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ 
                    width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(124,58,237,0.05) 100%)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
                    border: '1px solid rgba(124,58,237,0.2)',
                    boxShadow: '0 0 15px rgba(124,58,237,0.1)'
                  }}>🌊</div>
                  <div>
                    <h3 style={{ fontSize: '19px', fontWeight: 700, color: '#fff', margin: 0 }}>Walrus</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px', fontWeight: 500 }}>Storage Protocol</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <ReferenceLink href="https://docs.wal.app/" label="Documentation" />
                  <ReferenceLink href="https://www.walrus.xyz/" label="Official Website" />
                </div>
              </motion.div>

              {/* Sui Card */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                whileInView={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -4, borderColor: 'rgba(124,58,237,0.25)', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.6), 0 0 20px rgba(124,58,237,0.08)' }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="card" 
                style={{ 
                  padding: '28px', 
                  textAlign: 'left',
                  background: 'rgba(23, 23, 23, 0.4)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '24px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ 
                    width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(124,58,237,0.05) 100%)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
                    border: '1px solid rgba(124,58,237,0.2)',
                    boxShadow: '0 0 15px rgba(124,58,237,0.1)'
                  }}>💧</div>
                  <div>
                    <h3 style={{ fontSize: '19px', fontWeight: 700, color: '#fff', margin: 0 }}>Sui</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px', fontWeight: 500 }}>Layer 1 Blockchain</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <ReferenceLink href="https://sui.io/" label="Official Website" />
                  <ReferenceLink href="https://docs.sui.io/" label="Developer Docs" />
                  <ReferenceLink href="https://github.com/MystenLabs/sui" label="GitHub Repository" />
                </div>
              </motion.div>
            </div>
          </section>
        </main>
      </div>
    );
  }


  if (status === 'success') return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'var(--bg)', backgroundImage:'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(124,58,237,0.13) 0%, transparent 60%)' }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="card" 
        style={{ 
          padding: '48px 32px', maxWidth: '480px', width: '100%', textAlign: 'center', margin: '24px',
          border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(23, 23, 23, 0.8)',
          backdropFilter: 'blur(20px)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ 
          width: '80px', height: '80px', background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)', 
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
          fontSize: '40px', margin: '0 auto 24px', boxShadow: '0 0 30px rgba(74,222,128,0.3)' 
        }}>
          ✓
        </div>
        
        <h2 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '12px', letterSpacing: '-0.02em', color: '#fff' }}>
          Application Submitted!
        </h2>
        <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.6, marginBottom: '32px' }}>
          Your submission is permanently stored on Walrus Mainnet. The team will review it shortly.
        </p>

        {/* Premium Blob ID Section */}
        <div style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '16px', padding: '20px', marginBottom: '32px', textAlign: 'left' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>📋</span> Decentralized Proof (Blob ID)
          </p>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'rgba(255,255,255,0.7)', wordBreak: 'break-all', lineHeight: 1.6, background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '10px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            {submittedBlobId}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', fontWeight: 600 }}
            onClick={(e) => { 
              navigator.clipboard.writeText(submittedBlobId);
              const btn = e.currentTarget;
              const oldText = btn.innerText;
              btn.innerText = '✓ Copied to Clipboard!';
              btn.style.color = '#4ade80';
              setTimeout(() => { btn.innerText = oldText; btn.style.color = ''; }, 2000);
            }}
          >
            Copy ID to share with Admin
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <a href={getWalrusScanUrl(submittedBlobId)} target="_blank" rel="noopener noreferrer"
            className="btn btn-primary" style={{ display: 'flex', textDecoration: 'none', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            View on Walruscan ↗
          </a>
          <button onClick={() => window.location.reload()} className="btn btn-ghost btn-sm" style={{ color: 'var(--text-3)' }}>
            Submit another application
          </button>
        </div>
      </motion.div>
    </div>
  );


  // ── Form ──────────────────────────────────────────────────────
  return (
    <ClientOnly>
      <div style={{ minHeight:'100dvh', backgroundColor:'var(--bg)', backgroundImage:'radial-gradient(ellipse 80% 35% at 50% 0%, rgba(124,58,237,0.13) 0%, transparent 60%)' }}>
        {/* Header */}
        <header style={{ position:'sticky', top:0, zIndex:40, backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)', borderBottom:'1px solid rgba(255,255,255,0.05)', background:'rgba(7,9,15,0.85)' }}>
          <div style={{ maxWidth:'720px', margin:'0 auto', padding:'0 24px', height:'56px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'9px' }}>
              <svg width={24} height={24} viewBox="0 0 32 32" fill="none"><rect width={32} height={32} rx={8} fill="rgba(124,58,237,0.18)"/><path d="M10 22V14l6-4 6 4v8" stroke="#a78bfa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/><path d="M13 22v-5h6v5" stroke="#7c3aed" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span style={{ fontSize:'15px', fontWeight:700, letterSpacing:'-0.03em' }}>Motion</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              {account ? (
                <>
                  <button className="addr-chip" onClick={() => { navigator.clipboard.writeText(account.address); setWCopied(true); setTimeout(()=>setWCopied(false),1800); }} style={{ border:'none' }}>
                    <span className="addr-dot anim-pulse"/>
                    <span className="mono">{shorten(account.address)}</span>
                    {wCopied && <span style={{ fontSize:'10px', color:'#4ade80' }}>✓</span>}
                  </button>
                  <button onClick={() => disconnect()} style={{ fontSize:'11px', color:'var(--text-3)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', textUnderlineOffset:'2px' }}>Disconnect</button>
                </>
              ) : <ConnectButton instance={dAppKit} />}
            </div>
          </div>
        </header>

        {/* Form */}
        <main style={{ maxWidth:'720px', margin:'0 auto', padding:'48px 24px 80px' }}>
          <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{duration:0.4,ease:[0.16,1,0.3,1]}}>
            <h1 style={{ fontSize:'26px', fontWeight:800, letterSpacing:'-0.03em', marginBottom:'8px' }}>{config.title}</h1>
            <p style={{ fontSize:'14px', color:'var(--text-2)', lineHeight:1.6, marginBottom:'40px' }}>{config.description}</p>

            <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>
              {enabledFields.map((f, i) => (
                <motion.div key={f.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.03,duration:0.3}}>
                  {f.type === 'checkbox' ? (
                    // Checkbox: label is inside the input
                    <div>
                      <FieldInput field={f} value={data[f.id]??false} onChange={v=>setField(f.id,v)} onFile={file=>handleFile(f.id,file)} uploading={!!fileUploading[f.id]} />
                      {errors[f.id] && <p style={{ fontSize:'12px', color:'#f87171', marginTop:'5px' }}>{errors[f.id]}</p>}
                    </div>
                  ) : (
                    <div>
                      <label className="input-label" style={{ fontSize:'14px', color:'var(--text-1)', marginBottom:'8px' }}>
                        {f.label} {f.required && <span className="input-required">*</span>}
                      </label>
                      {f.helpText && (
                        <p style={{ fontSize:'12px', color:'var(--text-3)', marginBottom:'8px', lineHeight:1.5 }}>
                          {f.helpText}{' '}
                          {f.linkUrl && <a href={f.linkUrl} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent-2)'}}>{f.linkText||f.linkUrl} ↗</a>}
                        </p>
                      )}
                      <FieldInput field={f} value={data[f.id]??''} onChange={v=>setField(f.id,v)} onFile={file=>handleFile(f.id,file)} uploading={!!fileUploading[f.id]} />
                      {errors[f.id] && <p style={{ fontSize:'12px', color:'#f87171', marginTop:'5px' }}>{errors[f.id]}</p>}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Error */}
            {errMsg && <div className="alert-error" style={{ marginTop:'24px' }}>{errMsg}</div>}

            {/* Submit */}
            <div style={{ marginTop:'36px', paddingTop:'24px', borderTop:'1px solid var(--border)' }}>
              {account ? (
                <button className="btn btn-primary btn-lg" style={{ width:'100%' }}
                  onClick={handleSubmit} disabled={status==='signing'||status==='submitting'}>
                  {status==='signing'   ? <><span className="spinner"/> Waiting for wallet approval…</>
                   :status==='submitting'? <><span className="spinner"/> Storing on Walrus…</>
                   : 'Sign & Submit'}
                </button>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'16px', padding:'24px', background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.2)', borderRadius:'16px' }}>
                  <div style={{ fontSize:'24px' }}>🛡️</div>
                  <p style={{ fontSize:'14px', color:'var(--text-1)', fontWeight:600 }}>Wallet Required</p>
                  <p style={{ fontSize:'12px', color:'var(--text-3)', textAlign:'center', lineHeight:1.5 }}>
                    To ensure data integrity and pay for decentralized storage on Walrus Mainnet, please connect your Sui wallet.
                  </p>
                  <ConnectButton instance={dAppKit} />
                </div>
              )}
              <p style={{ marginTop:'12px', fontSize:'12px', color:'var(--text-3)', textAlign:'center' }}>
                Stored on <a href="https://walrus.space" target="_blank" rel="noopener noreferrer" style={{color:'var(--text-2)',textDecoration:'none'}}>Walrus</a> · Decentralised · No server · No database
              </p>
            </div>
          </motion.div>
        </main>
      </div>
    </ClientOnly>
  );
}
