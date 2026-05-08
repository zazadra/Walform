'use client';
import { useState, useEffect } from 'react';
import { useCurrentAccount, useCurrentWallet } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { readJsonFromWalrus, getWalrusScanUrl } from '@/lib/walrus';
import { uploadOnChain, uploadJsonOnChain } from '@/lib/walrus-onchain';
import { addSubId, DEFAULT_CONFIG, loadAdminConfig } from '@/lib/fields';
import { publishSubmission } from '@/lib/submission-index';
import type { FormConfig, SessionField, Submission } from '@/types/walform';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'framer-motion';
import dynamic from 'next/dynamic';

const ClientOnly = dynamic(() => Promise.resolve(({ children }: { children: React.ReactNode }) => <>{children}</>), { ssr: false });

function uid() { return Math.random().toString(36).slice(2, 10); }
function shorten(a: string) { return `${a.slice(0,6)}-${a.slice(-4)}`; }

// -- Single field renderer ------------------------------------------
function FieldInput({ field, value, onChange, onFile, uploading }: {
  field: SessionField;
  value: string | string[] | boolean;
  onChange: (v: string | string[] | boolean) => void;
  onFile: (f: File | File[]) => Promise<void>;
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
          <option value="">Select Option</option>
          {field.options?.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'checkbox':
      if (field.options && field.options.length > 0) {
        const selected = (value as string[]) || [];
        return (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginTop:'4px' }}>
            {field.options.map(opt => (
              <label key={opt} style={{ display:'flex', alignItems:'center', gap:'12px', cursor:'pointer', fontSize:'14px', color:'var(--text-2)' }}>
                <input 
                  type="checkbox" 
                  checked={selected.includes(opt)} 
                  onChange={e => {
                    const next = e.target.checked 
                      ? [...selected, opt]
                      : selected.filter(s => s !== opt);
                    onChange(next);
                  }}
                  style={{ width:'18px', height:'18px', accentColor:'var(--accent)', cursor:'pointer' }}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        );
      }
      return (
        <label style={{ display:'flex', alignItems:'flex-start', gap:'10px', cursor:'pointer', fontSize:'14px', color:'var(--text-2)' }}>
          <input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked)}
            style={{ width:'16px', height:'16px', accentColor:'var(--accent)', cursor:'pointer', marginTop:'2px', flexShrink:0 }} />
          <span>{field.label}{field.linkUrl && <> - <a href={field.linkUrl} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent-2)'}}>{field.linkText||field.linkUrl}</a></>}</span>
        </label>
      );
    case 'file': {
      const currentFiles = Array.isArray(value) ? (value as string[]) : (value && typeof value === 'string' ? [value as string] : []);
      const triggerInput = () => {
        const input = document.getElementById(`file-input-${field.id}`);
        if (input) (input as HTMLInputElement).click();
      };
      const removeFile = (idx: number) => {
        const next = currentFiles.filter((_, i) => i !== idx);
        onChange(next.length === 1 ? next[0] : next);
      };

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            id={`file-input-${field.id}`}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx"
            multiple
            style={{ display: 'none' }}
            onChange={async e => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                await onFile(files);
              }
              // reset input so same file can be selected again
              e.target.value = '';
            }}
          />

          {/* Preview gallery */}
          {currentFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {currentFiles.map((blobId, idx) => (
                <div key={idx} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)', width: '100px', height: '100px', flexShrink: 0, background: 'rgba(255,255,255,0.03)' }}>
                  <img
                    src={`https://aggregator.walrus.space/v1/blobs/${blobId}`}
                    alt={`Upload ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => {
                      // If not an image, show a generic file icon
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.style.display = 'flex';
                        parent.style.alignItems = 'center';
                        parent.style.justifyContent = 'center';
                        parent.style.fontSize = '28px';
                        parent.setAttribute('data-icon', '📄');
                      }
                    }}
                  />
                  <button
                    onClick={() => removeFile(idx)}
                    title="Remove file"
                    style={{
                      position: 'absolute', top: '4px', right: '4px',
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: 'rgba(0,0,0,0.7)', border: 'none', cursor: 'pointer',
                      color: '#fff', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, lineHeight: 1
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Add more tile */}
              <div
                onClick={triggerInput}
                style={{
                  width: '100px', height: '100px', borderRadius: '10px',
                  border: '1px dashed var(--border)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '4px', fontSize: '11px', color: 'var(--text-3)', background: 'rgba(255,255,255,0.02)',
                  transition: 'all 0.15s', flexShrink: 0
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; }}
              >
                <span style={{ fontSize: '20px' }}>+</span>
                <span>Add more</span>
              </div>
            </div>
          )}

          {/* Drop zone (shown when no files yet or uploading) */}
          {!uploading && (
            <div
              onClick={triggerInput}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '10px',
                border: '1px dashed var(--border)', cursor: 'pointer',
                background: 'rgba(255,255,255,0.02)', fontSize: '13px', color: 'var(--text-3)', transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <>📁 {currentFiles.length > 0 ? 'Add more files...' : 'Click to select files (images, docs, videos)'}</>
            </div>
          )}
          {uploading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.05)', color: 'var(--accent-2)', fontSize: '13px' }}>
              <span className="spinner" /> Uploading to Walrus...
            </div>
          )}
        </div>
      );
    }

    default: return null;
  }
}

// -- Reference Link ------------------------------------------------
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

// -- Interactive Visual Components --------------------------------
function BackgroundParticles({ isMobile }: { isMobile: boolean }) {
  const count = isMobile ? 8 : 20;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      {[...Array(count)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ 
            x: Math.random() * 100 + '%', 
            y: Math.random() * 100 + '%', 
            opacity: Math.random() * 0.5,
            scale: Math.random() * 0.5 + 0.5
          }}
          animate={{ 
            y: [null, '-=100', '+=100'],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{ 
            duration: Math.random() * 10 + 10, 
            repeat: Infinity, 
            ease: "linear" 
          }}
          style={{
            position: 'absolute',
            width: '2px',
            height: '2px',
            borderRadius: '50%',
            background: 'var(--accent-2)',
            boxShadow: '0 0 10px var(--accent-2)',
          }}
        />
      ))}
    </div>
  );
}

function FloatingWalrus({ mousePos, isMobile }: { mousePos: { x: number, y: number }, isMobile: boolean }) {
  const { scrollYProgress } = useScroll();
  
  const smoothX = useSpring(mousePos.x, { damping: 20, stiffness: 100 });
  const smoothY = useSpring(mousePos.y, { damping: 20, stiffness: 100 });

  const combine = (base: any, wiggle: any) => useTransform([base, wiggle], ([b, w]) => (b as number) + (w as number));

  const hiddenOffset = isMobile ? 80 : 150;

  // 1. Bottom Right (0.12 - 0.30)
  const peek1Opacity = useTransform(scrollYProgress, [0.12, 0.15, 0.27, 0.30], [0, 1, 1, 0]);
  const peek1YBase = useTransform(scrollYProgress, [0.12, 0.15, 0.27, 0.30], [hiddenOffset, 0, 0, hiddenOffset]);
  
  // 4. Right Side (0.30 - 0.48) - Tilted
  const peek4Opacity = useTransform(scrollYProgress, [0.30, 0.33, 0.45, 0.48], [0, 1, 1, 0]);
  const peek4XBase = useTransform(scrollYProgress, [0.30, 0.33, 0.45, 0.48], [hiddenOffset, 0, 0, hiddenOffset]);
  
  // 2. Left Side (0.50 - 0.68) - Tilted
  const peek2Opacity = useTransform(scrollYProgress, [0.50, 0.53, 0.65, 0.68], [0, 1, 1, 0]);
  const peek2XBase = useTransform(scrollYProgress, [0.50, 0.53, 0.65, 0.68], [-hiddenOffset, 0, 0, -hiddenOffset]);

  // 5. Top Right (0.70 - 0.88)
  const peek5Opacity = useTransform(scrollYProgress, [0.70, 0.73, 0.85, 0.88], [0, 1, 1, 0]);
  const peek5YBase = useTransform(scrollYProgress, [0.70, 0.73, 0.85, 0.88], [-hiddenOffset, 0, 0, -hiddenOffset]);

  // 3. Bottom Left (0.88 - 0.99)
  const peek3Opacity = useTransform(scrollYProgress, [0.88, 0.91, 0.96, 0.99], [0, 1, 1, 0]);
  const peek3YBase = useTransform(scrollYProgress, [0.88, 0.91, 0.96, 0.99], [hiddenOffset, 0, 0, hiddenOffset]);

  return (
    <>
      {/* Peek 1: Bottom Right */}
      <motion.div
        style={{
          position: 'fixed', bottom: '-20px', right: '5%', width: isMobile ? '100px' : '180px', zIndex: 10000,
          opacity: peek1Opacity, y: combine(peek1YBase, useTransform(smoothY, [-500, 500], [-5, 5])), x: useTransform(smoothX, [-500, 500], [-10, 10]),
          pointerEvents: 'none'
        }}
      >
        <motion.img 
          src="/walform-mascot.png" alt="Walrus Peek" animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
          transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 4 }}
          style={{ width: '100%', height: 'auto', transform: 'rotate(-20deg)', filter: 'drop-shadow(0 0 30px rgba(124,58,237,0.4))' }} 
        />
      </motion.div>

      {/* Peek 4: Right Side (Tilted) */}
      <motion.div
        style={{
          position: 'fixed', top: '30%', right: isMobile ? '-15px' : '-30px', width: isMobile ? '80px' : '140px', zIndex: 10000,
          opacity: peek4Opacity, x: combine(peek4XBase, useTransform(smoothX, [-500, 500], [-5, 5])), y: useTransform(smoothY, [-500, 500], [-10, 10]),
          pointerEvents: 'none'
        }}
      >
        <motion.img 
          src="/walform-mascot.png" alt="Walrus Peek" animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
          transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 3.5 }}
          style={{ width: '100%', height: 'auto', transform: 'rotate(-110deg)', filter: 'drop-shadow(0 0 30px rgba(124,58,237,0.3))' }} 
        />
      </motion.div>

      {/* Peek 2: Left Side (Tilted) */}
      <motion.div
        style={{
          position: 'fixed', top: '45%', left: isMobile ? '-10px' : '-20px', width: isMobile ? '90px' : '150px', zIndex: 10000,
          opacity: peek2Opacity, x: combine(peek2XBase, useTransform(smoothX, [-500, 500], [-5, 5])), y: useTransform(smoothY, [-500, 500], [-10, 10]),
          pointerEvents: 'none'
        }}
      >
        <motion.img 
          src="/walform-mascot.png" alt="Walrus Peek" animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
          transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 5 }}
          style={{ width: '100%', height: 'auto', transform: 'rotate(110deg)', filter: 'drop-shadow(0 0 30px rgba(124,58,237,0.4))' }} 
        />
      </motion.div>

      {/* Peek 5: Top Right */}
      <motion.div
        style={{
          position: 'fixed', top: '-40px', right: '15%', width: isMobile ? '100px' : '160px', zIndex: 10000,
          opacity: peek5Opacity, y: combine(peek5YBase, useTransform(smoothY, [-500, 500], [-5, 5])), x: useTransform(smoothX, [-500, 500], [-10, 10]),
          pointerEvents: 'none'
        }}
      >
        <motion.img 
          src="/walform-mascot.png" alt="Walrus Peek" animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
          transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 4.5 }}
          style={{ width: '100%', height: 'auto', transform: 'rotate(160deg)', filter: 'drop-shadow(0 0 30px rgba(124,58,237,0.3))' }} 
        />
      </motion.div>

      {/* Peek 3: Bottom Left */}
      <motion.div
        style={{
          position: 'fixed', bottom: '-30px', left: '10%', width: isMobile ? '110px' : '200px', zIndex: 10000,
          opacity: peek3Opacity, y: combine(peek3YBase, useTransform(smoothY, [-500, 500], [-5, 5])), x: useTransform(smoothX, [-500, 500], [-10, 10]),
          pointerEvents: 'none'
        }}
      >
        <motion.img 
          src="/walform-mascot.png" alt="Walrus Peek" animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
          transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 6 }}
          style={{ width: '100%', height: 'auto', transform: 'rotate(25deg)', filter: 'drop-shadow(0 0 40px rgba(124,58,237,0.5))' }} 
        />
      </motion.div>
    </>
  );
}

// -- Main page ------------------------------------------------------
export default function Home() {
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const disconnect = () => dAppKit.disconnectWallet();
  const address = account?.address;

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [currentStep, setCurrentStep] = useState(0);

  // Track mouse for hero parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 40,
        y: (e.clientY / window.innerHeight - 0.5) * 40
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const enabledFields = config.fields.filter(f => f.enabled && f.id !== 'newsletter');

  function handleNext() {
    // If we are at intro or field steps, check validation for current field
    if (currentStep > 0 && currentStep <= enabledFields.length) {
      const field = enabledFields[currentStep - 1];
      if (field.required) {
        const v = data[field.id];
        const empty = v===undefined||v===''||v===false||(Array.isArray(v)&&v.length===0);
        if (empty) {
          setErrors(e => ({ ...e, [field.id]: 'This field is required.' }));
          return;
        }
      }
    }
    if (currentStep <= enabledFields.length) {
      setCurrentStep(s => s + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Prevent enter on textareas unless shift is held
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA') return;
        
        // If we are on a field step, try to go next
        if (status === 'idle' || status === 'error') {
           handleNext();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, data, enabledFields, status]);

  // Load form config from ?form=blobId or fallback to localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fid = params.get('form');
    
    if (!fid) { 
      const isPreview = params.get('preview') === 'true';
      if (isPreview) {
        const local = loadAdminConfig();
        if (local) {
          setConfig(local);
          setFormBlobId('local');
        }
      }
      setConfigLoading(false); 
      return; 
    }

    setFormBlobId(fid);
    
    // Performance optimization: If we have the exact same config in localStorage, use it instantly
    const local = loadAdminConfig();
    if (local && local.publishedBlobId === fid) {
      console.log("- Instant load: Using local cache for published form", fid);
      console.log("-- Form Config:", local);
      setConfig(local);
      setConfigLoading(false);
      return;
    }

    let attempts = 0;
    const fetchConfig = async () => {
      try {
        console.log(`-- Fetching form from Walrus (Attempt ${attempts + 1}):`, fid);
        const cfg = await readJsonFromWalrus<FormConfig>(fid);
        if (cfg && cfg.fields) {
          console.log("- Form loaded successfully from Walrus:", fid);
          console.log("-- Form Config:", cfg);
          setConfig(cfg);
          setConfigLoading(false);
          return true;
        }
      } catch (err) {
        console.warn(`-- Attempt ${attempts + 1} failed to load form:`, err);
      }
      return false;
    };

    const run = async () => {
      const success = await fetchConfig();
      if (!success && attempts < 3) {
        attempts++;
        setTimeout(run, 2000); 
      } else {
        if (!success) {
          console.error("- Failed to load form configuration after 3 attempts.");
        }
        setConfigLoading(false);
      }
    };
    run();
  }, []);

  // --- Banner for local preview ---
  const isLocalPreview = formBlobId === 'local';

  function setField(id: string, v: string|string[]|boolean) {
    setData(d => ({ ...d, [id]: v }));
    setErrors(e => { const n={...e}; delete n[id]; return n; });
  }

  async function handleFile(fieldId: string, files: File | File[]) {
    if (!address) {
      setErrors(e => ({ ...e, [fieldId]: 'Please connect your wallet first to upload files.' }));
      return;
    }
    setFileUploading(u => ({ ...u, [fieldId]: true }));
    try {
      const { uploadOnChain } = await import('@/lib/walrus-onchain');
      
      const fileArray = Array.isArray(files) ? files : [files];
      const newBlobIds: string[] = [];
      
      for (const file of fileArray) {
        const { blobId } = await uploadOnChain(file, address, 1);
        newBlobIds.push(blobId);
      }
      
      // Append to existing uploads instead of replacing
      setData(d => {
        const existing = d[fieldId];
        const existingArr = Array.isArray(existing) ? existing : (existing && typeof existing === 'string' ? [existing] : []);
        const combined = [...(existingArr as string[]), ...newBlobIds];
        return { ...d, [fieldId]: combined.length === 1 ? combined[0] : combined };
      });
      setErrors(e => { const n = { ...e }; delete n[fieldId]; return n; });
    } catch (err: any) { 
      setErrors(e => ({ ...e, [fieldId]: err.message || 'File upload failed - try again.' })); 
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

    if (!wallet) {
      setStatus('idle');
      setErrMsg('Wallet not available. Please reconnect your wallet.');
      return;
    }

    const adminWallet = config.publishedBy;

    setStatus('signing');
    try {
      // ── Step 1: Sign a message with wallet (triggers wallet popup) ──────
      const submissionId = uid();
      const timestamp = Date.now();
      const messageText = [
        'Walform Submission',
        `Form: ${formBlobId}`,
        `Submitter: ${address}`,
        `Timestamp: ${timestamp}`,
        `ID: ${submissionId}`,
      ].join('\n');

      const messageBytes = new TextEncoder().encode(messageText);
      let walletSignature = '';
      try {
        // Use standardized Sui Wallet feature for signing
        const signFeature = (wallet as any)?.features?.['sui:signPersonalMessage'];
        if (!signFeature) throw new Error("Wallet signing not supported by this wallet.");
        const signResult = await signFeature.signPersonalMessage({ message: messageBytes });
        // signResult is { signature: string (base64), bytes: string (base64) }
        walletSignature = typeof signResult === 'object' && signResult !== null
          ? (signResult as any).signature ?? ''
          : '';
      } catch (signErr: any) {
        // User rejected in wallet
        if (signErr?.message?.toLowerCase().includes('reject') || signErr?.code === 4001) {
          setStatus('idle');
          setErrMsg('Submission cancelled — you rejected the signature request.');
          return;
        }
        // Other signing error — still proceed but without signature
        console.warn('Wallet signing failed, proceeding without signature:', signErr);
      }

      // ── Step 2: Upload submission blob to Walrus ──────────────────────
      setStatus('submitting');

      const submission: Submission = {
        id: submissionId,
        formId: formBlobId,
        formBlobId,
        data,
        submitterAddress: address,
        timestamp,
        status: 'pending',
        // Embed wallet signature for authenticity proof
        ...(walletSignature ? { walletSignature, signedMessage: messageText } : {}),
      };

      const { uploadOnChain } = await import('@/lib/walrus-onchain');
      const { blobId } = await uploadOnChain(JSON.stringify(submission), address, 5, adminWallet || undefined);
      submission.blobId = blobId;

      // ── Step 3: Update Registry (Persistent Discovery) ─────────────
      try {
        const { updateFormRegistry } = await import('@/lib/registry');
        const targetAdmin = adminWallet || (config.admins && config.admins[0]) || '';
        if (targetAdmin) {
          await updateFormRegistry(targetAdmin, formBlobId, blobId, address);
        }
      } catch (regErr) {
        console.warn('Registry update failed:', regErr);
      }

      // Also index in localStorage for same-browser instant discovery
      addSubId(formBlobId, blobId);
      // Broadcast to any open admin tabs in the same browser
      publishSubmission(blobId, formBlobId);

      setSubmittedBlobId(blobId);
      setStatus('success');
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Upload failed.');
      setStatus('error');
    }
  }

  // -- Loading --------------------------------------------------
  if (configLoading) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', color:'var(--text-3)', gap:'10px' }}>
      <span className="spinner" style={{width:'20px',height:'20px'}}/> Loading form...
    </div>
  );

  // -- No form --------------------------------------------------
  if (!new URLSearchParams(window.location.search).get('form') && formBlobId === 'default') {
    return (
      <div style={{ minHeight:'100dvh', backgroundColor:'var(--bg)', display: 'flex', flexDirection: 'column', position: 'relative', overflowX: 'hidden' }}>
        <BackgroundParticles isMobile={isMobile} />
        <FloatingWalrus mousePos={mousePos} isMobile={isMobile} />
        <header style={{ 
          padding:'32px 48px', 
          display:'flex', 
          alignItems:'center', 
          justifyContent:'space-between', 
          maxWidth:'100%', 
          margin:'0', 
          width:'100%', 
          zIndex: 20,
          position: 'absolute',
          top: 0,
          left: 0
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
            <motion.img 
              src="/walform-mascot.png" 
              alt="Walform Logo" 
              style={{ 
                height: '54px', 
                width: 'auto',
                filter: 'drop-shadow(0 0 20px rgba(124,58,237,0.3))'
              }}
              whileHover={{ scale: 1.05, rotate: -2 }}
            />
            <span style={{ fontSize:'24px', fontWeight:900, letterSpacing:'-0.05em', background: 'linear-gradient(to bottom, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Walform</span>
          </div>
          <div style={{ display:'flex', gap:'16px' }}>
            <a href="/admin" className="btn btn-primary btn-sm" style={{ padding: '10px 24px' }}>Launch App</a>
          </div>
        </header>

        <main style={{ position: 'relative', width: '100%' }}>
          {/* Hero Section Container */}
          <div style={{ 
            position: 'relative',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            padding: '120px 24px 80px'
          }}>
            {/* Animated Background Layers */}
            <motion.div 
              animate={{ 
                x: [mousePos.x * -0.3, mousePos.x * -0.4, mousePos.x * -0.3],
                y: [mousePos.y * -0.3, mousePos.y * -0.4, mousePos.y * -0.3]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              style={{
                position: 'absolute',
                width: '120%',
                height: '120%',
                background: 'radial-gradient(circle at 50% 50%, rgba(124,58,237,0.12) 0%, transparent 60%)',
                filter: 'blur(80px)',
                zIndex: 1
              }}
            />
            <motion.div 
              animate={{ 
                x: [mousePos.x * 0.2, mousePos.x * 0.3, mousePos.x * 0.2],
                y: [mousePos.y * 0.2, mousePos.y * 0.3, mousePos.y * 0.2]
              }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                background: 'radial-gradient(circle at 30% 70%, rgba(34,211,238,0.08) 0%, transparent 50%)',
                filter: 'blur(100px)',
                zIndex: 1
              }}
            />
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 50% 50%, transparent 0%, var(--bg) 90%)',
              zIndex: 2
            }} />
            
            <div style={{ 
              maxWidth: '1600px', 
              width: '100%', 
              zIndex: 10, 
              position: 'relative',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: 'center',
              gap: isMobile ? '60px' : '40px',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              {/* Left Content */}
              <motion.div 
                initial={{ opacity: 0, x: -40 }} 
                animate={{ opacity: 1, x: 0 }} 
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ flex: '1 1 600px', textAlign: isMobile ? 'center' : 'left' }}
              >
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 1, delay: 0.2 }}
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    padding: '6px 16px', 
                    borderRadius: '999px', 
                    background: 'rgba(139, 92, 246, 0.1)', 
                    border: '1px solid rgba(139, 92, 246, 0.2)', 
                    marginBottom: '40px', 
                    backdropFilter: 'blur(10px)',
                    color: 'var(--accent-2)',
                    fontSize: '13px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em'
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-2)', boxShadow: '0 0 12px var(--accent-2)' }} />
                  Native Walrus Infrastructure
                </motion.div>
                
                <h1 style={{ fontSize:'clamp(48px, 8vw, 96px)', fontWeight:900, letterSpacing:'-0.05em', lineHeight:0.95, marginBottom:'32px', color: '#fff' }}>
                  <motion.span 
                    initial={{ opacity: 0, filter: 'blur(10px)' }} 
                    animate={{ opacity: 1, filter: 'blur(0px)' }} 
                    transition={{ duration: 0.8, delay: 0.4 }}
                    style={{ display: 'block' }}
                  >
                    Your forms should
                  </motion.span>
                  <motion.span 
                    initial={{ opacity: 0, x: -20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    transition={{ duration: 0.8, delay: 0.6 }}
                    style={{ background: 'linear-gradient(135deg, var(--accent-2) 0%, var(--cyan) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'block' }}
                  >
                    belong to you.
                  </motion.span>
                </h1>
                
                <motion.p 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  transition={{ duration: 1, delay: 0.8 }}
                  style={{ fontSize:'clamp(18px, 2vw, 20px)', color:'var(--text-2)', lineHeight:1.6, maxWidth:'600px', marginBottom:'48px', fontWeight: 500 }}
                >
                  Decentralized workflows for the next internet. Build, collect, and own your data-powered by Walrus and Sui.
                </motion.p>
                
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ duration: 0.8, delay: 1 }}
                  style={{ display:'flex', gap:'20px', flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'center' : 'flex-start', width: '100%' }}
                >
                  <a href="/admin" className="btn btn-primary btn-xl" style={{ textDecoration:'none', padding: '18px 40px', borderRadius: '16px', fontSize: '18px', fontWeight: 700, boxShadow: '0 20px 40px rgba(124,58,237,0.3)', textAlign: 'center' }}>
                    Enter Walform
                  </a>
                  <a href="https://walrus.xyz" target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-xl" style={{ textDecoration:'none', padding: '18px 40px', borderRadius: '16px', fontSize: '18px', fontWeight: 600, textAlign: 'center' }}>
                    Explore Walrus
                  </a>
                </motion.div>
              </motion.div>

              {/* Right Mascot Image */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: 40 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
                style={{ flex: '1 1 400px', display: 'flex', justifyContent: 'center', position: 'relative', order: isMobile ? -1 : 1 }}
              >
                <div style={{ position: 'absolute', inset: '-10%', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)', zIndex: -1, opacity: 0.6 }} />
                <motion.img 
                  src="/walform-mascot.png" 
                  alt="Walform Mascot"
                  style={{ width: isMobile ? '80%' : '100%', maxWidth: '480px', height: 'auto', filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.6))' }}
                  animate={{ 
                    y: [0, -25, 0],
                    rotate: [0, 2, 0, -2, 0]
                  }}
                  transition={{ 
                    duration: 6, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                  }}
                  whileHover={{ scale: 1.02, filter: 'drop-shadow(0 40px 80px rgba(124,58,237,0.4))' }}
                />
              </motion.div>
            </div>
          </div>


          {/* -- PART 1: MOTION EXPLANATION ---------------------------------- */}
          <section style={{ width: '100%', maxWidth: '1200px', margin: '160px auto 0', padding: '0 24px', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, var(--accent-soft), transparent 70%)', opacity: 0.5, filter: 'blur(60px)', zIndex: 0 }} />
            
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: isMobile ? '40px' : '80px', position: 'relative', zIndex: 2 }}>
              <motion.div
                initial={{ opacity: 0, x: -40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                style={{ flex: '1 1 600px' }}
              >
                <h2 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '24px', lineHeight: 1.1, textAlign: isMobile ? 'center' : 'left', width: '100%' }}>
                  Built for ownership,<br/>
                  <span style={{ color: 'var(--accent-2)' }}>not platforms.</span>
                </h2>
                <p style={{ fontSize: isMobile ? '18px' : '20px', color: 'var(--text-2)', lineHeight: 1.6, maxWidth: '540px', marginBottom: '40px', fontWeight: 500, textAlign: isMobile ? 'center' : 'left' }}>
                  Walform eliminates centralized control. By leveraging Walrus, we ensure your feedback loops are permanent, composable, and censorship-resistant from day one.
                </p>
                
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: isMobile ? 'center' : 'flex-start' }}>
                  {['Secure', 'Permanent', 'Composable', 'Censorship-Resistant'].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-3)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-2)' }} />
                      {item}
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9, x: 40 }}
                whileInView={{ opacity: 1, scale: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.2 }}
                style={{ flex: '1 1 300px', display: 'flex', justifyContent: 'center', order: isMobile ? -1 : 1 }}
              >
                <img 
                  src="/walrus-1.png" 
                  alt="Walform Mascot" 
                  style={{ width: '100%', maxWidth: '450px', height: 'auto', mixBlendMode: 'screen', filter: 'drop-shadow(0 20px 40px rgba(124,58,237,0.4))' }} 
                />
              </motion.div>
            </div>
          </section>

          {/* -- PART 2: FLOW SECTION ---------------------------------------- */}
          <section style={{ width: '100%', maxWidth: '1000px', margin: '200px auto 0', padding: '0 24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent-2)', marginBottom: '64px' }}>How it works</h3>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
              gap: '24px', 
              position: 'relative' 
            }}>
              {[
                { title: 'Connect', desc: 'Authenticate instantly using Sui wallets.', icon: '🔌' },
                { title: 'Build', desc: 'Create forms and surveys with flexible customization.', icon: '🛠️' },
                { title: 'Store', desc: 'All data and media are stored permanently on Walrus.', icon: '💾' },
                { title: 'Analyze', desc: 'Manage admins and export insights seamlessly.', icon: '📊' }
              ].map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ y: -10, transition: { duration: 0.2 } }}
                  style={{ 
                    padding: '32px', 
                    borderRadius: '24px', 
                    background: 'rgba(255,255,255,0.03)', 
                    border: '1px solid var(--border)',
                    textAlign: 'left',
                    position: 'relative',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    transition: 'all 0.4s cubic-bezier(0.2, 0, 0, 1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.4), 0 0 20px rgba(124,58,237,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ fontSize: '36px', marginBottom: '24px', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.3))' }}>{step.icon}</div>
                  <h4 style={{ fontSize: '22px', fontWeight: 900, marginBottom: '12px', color: '#fff' }}>{step.title}</h4>
                  <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.6 }}>{step.desc}</p>
                  
                  {i < 3 && !isMobile && (
                    <div className="flow-arrow" style={{ 
                      position: 'absolute', 
                      right: '-16px', 
                      top: '50%', 
                      transform: 'translateY(-50%)', 
                      zIndex: 10,
                      opacity: 0.3,
                      fontSize: '20px',
                      color: 'var(--accent-2)',
                      pointerEvents: 'none'
                    }}>
                      -
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </section>

          {/* -- PART 3: UNIQUENESS / ADVANTAGES ------------------------------ */}
          <section style={{ width: '100%', maxWidth: '1200px', margin: '200px auto 0', padding: '0 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
              {([
                { title: '100% On-Chain', desc: 'Forms, submissions, and media are stored natively on decentralized infrastructure without relying on centralized databases.', icon: '-' },
                { title: 'Walrus Durability', desc: 'Powered by Walrus for resilient, permanent, and scalable decentralized storage.', image: '/walrus-official.png', imageStyle: { mixBlendMode: 'screen' } as any },
                { title: 'Sui Performance', desc: 'Built on Sui for fast interactions, smooth wallet UX, and scalable Web3 experiences.', image: 'https://cryptologos.cc/logos/sui-sui-logo.png?v=032' }
              ] as any[]).map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  whileHover={{ y: -12, transition: { duration: 0.2 } }}
                  style={{
                    padding: '48px',
                    borderRadius: '32px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    textAlign: 'left',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.4s cubic-bezier(0.2, 0, 0, 1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.boxShadow = '0 30px 60px rgba(0,0,0,0.5), 0 0 30px rgba(124,58,237,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.2)';
                  }}
                >
                  <div className="border-beam" />
                  <div style={{ fontSize: '40px', marginBottom: '32px', display: 'inline-flex', width: 64, height: 64, background: 'rgba(255,255,255,0.05)', borderRadius: '16px', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {card.image ? (
                      <img src={card.image} alt={card.title} style={{ width: '70%', height: '70%', objectFit: 'contain', ...card.imageStyle }} />
                    ) : (
                      card.icon
                    )}
                  </div>
                  <h4 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '16px' }}>{card.title}</h4>
                  <p style={{ fontSize: '16px', color: 'var(--text-2)', lineHeight: 1.6 }}>{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* OFFICIAL REFERENCES */}
          <section style={{ 
            marginTop: '160px', 
            padding: '120px 24px', 
            borderTop: '1px solid var(--border)', 
            maxWidth: '1100px', 
            margin: '160px auto 0', 
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
                Learn more about the ecosystem powering Walform.
              </motion.p>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
              gap: '32px',
              justifyContent: 'center'
            }}>
              {([
                {
                  title: "Walrus Ecosystem",
                  image: "/walrus-official.png",
                  tag: "Storage Protocol",
                  links: [
                    { label: "Documentation", url: "https://docs.wal.app/" },
                    { label: "Official Website", url: "https://www.walrus.xyz/" }
                  ],
                  imageStyle: { mixBlendMode: 'screen' } as React.CSSProperties
                },
                {
                  title: "Sui Network",
                  image: "https://cryptologos.cc/logos/sui-sui-logo.png?v=032",
                  tag: "Layer 1 Blockchain",
                  links: [
                    { label: "Main Website", url: "https://sui.io/" },
                    { label: "Developer Docs", url: "https://docs.sui.io/" },
                    { label: "Source Code", url: "https://github.com/MystenLabs/sui" }
                  ]
                }
              ] as any[]).map((section, idx) => {
                // Local component for reference links
                const ReferenceLink = ({ href, label }: { href: string, label: string }) => (
                  <a 
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '14px 24px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: '16px',
                      color: 'var(--text-1)',
                      fontSize: '15px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      transition: 'all 0.25s cubic-bezier(0.2, 0, 0, 1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.borderColor = 'var(--accent-2)';
                      e.currentTarget.style.transform = 'translateX(6px)';
                      e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateX(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {label}
                    <span style={{ opacity: 0.7, fontSize: '14px', transition: 'transform 0.25s' }}>-</span>
                  </a>
                );

                return (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -10, borderColor: 'rgba(124,58,237,0.4)', boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    style={{ 
                      padding: isMobile ? '32px' : '48px', 
                      background: 'rgba(255,255,255,0.02)',
                      backdropFilter: 'blur(24px)',
                      border: '1px solid var(--border)',
                      borderRadius: '40px',
                      display: 'flex',
                      flexDirection: isMobile ? 'column' : 'row',
                      gap: isMobile ? '32px' : '56px',
                      alignItems: 'center',
                      transition: 'all 0.4s cubic-bezier(0.2, 0, 0, 1)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 0% 0%, rgba(124,58,237,0.05), transparent 50%)', pointerEvents: 'none' }} />
                    <div style={{ flex: '0 0 auto', textAlign: 'center', position: 'relative', zIndex: 2 }}>
                      <div style={{ 
                        width: '100px', height: '100px', borderRadius: '28px', background: 'rgba(124,58,237,0.08)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px',
                        border: '1px solid rgba(124,58,237,0.2)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                        marginBottom: '24px',
                        overflow: 'hidden'
                      }}>
                        {section.image ? (
                          <img src={section.image} alt={section.title} style={{ width: '70%', height: '70%', objectFit: 'contain', ...section.imageStyle }} />
                        ) : (
                          section.icon
                        )}
                      </div>
                      <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>{section.title}</h3>
                      <p style={{ fontSize: '13px', color: 'var(--accent-2)', marginTop: '8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{section.tag}</p>
                    </div>
                    
                    <div style={{ width: '100%', display: 'grid', gap: '12px', position: 'relative', zIndex: 2 }}>
                      {section.links.map((link: any, lidx: number) => (
                        <ReferenceLink key={lidx} href={link.url} label={link.label} />
                      ))}
                    </div>
                  </motion.div>
                );
              })}
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
          -
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
            <span style={{ fontSize: '14px' }}>🔗</span> Decentralized Proof (Blob ID)
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
              btn.innerText = '- Copied to Clipboard!';
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


  // -- Form ------------------------------------------------------
  return (
    <ClientOnly>
      <div style={{ minHeight:'100dvh', backgroundColor:'var(--bg)', backgroundImage:'radial-gradient(ellipse 80% 35% at 50% 0%, rgba(124,58,237,0.13) 0%, transparent 60%)' }}>
        {/* Header */}
        <header style={{ position:'sticky', top:0, zIndex:40, backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)', borderBottom:'1px solid rgba(255,255,255,0.05)', background:'rgba(7,9,15,0.85)' }}>
          <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'0 24px', height:'64px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
            <a href="/" style={{ display:'flex', alignItems:'center', gap:'16px', textDecoration:'none' }}>
              <img src="/walform-mascot.png" alt="Walform Logo" style={{ width: '48px', height: 'auto', filter: 'drop-shadow(0 0 10px rgba(124,58,237,0.3))' }} />
              <span style={{ fontSize:'24px', fontWeight:900, letterSpacing:'-0.03em', color: '#fff' }}>Walform</span>
            </a>
            <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
              {account ? (
                <>
                  <button className="addr-chip" onClick={() => { navigator.clipboard.writeText(account.address); setWCopied(true); setTimeout(()=>setWCopied(false),1800); }} 
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '10px' }}>
                    <span className="addr-dot anim-pulse" style={{ width: '8px', height: '8px' }} />
                    <span className="mono" style={{ color: 'var(--text-1)', fontSize: '14px', fontWeight: 600 }}>{shorten(account.address)}</span>
                    {wCopied && <span style={{ fontSize:'12px', color:'#4ade80', fontWeight: 'bold', marginLeft: '6px' }}>✓</span>}
                  </button>
                  <button onClick={() => disconnect()} 
                    style={{ fontSize:'14px', fontWeight: 600, color:'var(--text-3)', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', borderRadius: '10px', padding: '8px 16px', cursor:'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                    Disconnect
                  </button>
                </>
              ) : <ConnectButton instance={dAppKit} />}
            </div>
          </div>
        </header>

        {/* Form */}
        <main style={{ maxWidth:'720px', margin:'0 auto', padding:'80px 24px 120px', minHeight: 'calc(100dvh - 56px)', display: 'flex', flexDirection: 'column' }}>
          
          {isLocalPreview && (
        <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:1000, background:'var(--accent)', color:'#fff', padding:'8px', textAlign:'center', fontSize:'12px', fontWeight:700, letterSpacing:'0.05em' }}>
          ⚠️ LIVE PREVIEW MODE - Changes saved locally but not published yet
        </div>
      )}

      {/* Progress Bar */}
          {currentStep > 0 && currentStep <= enabledFields.length + 1 && (
            <div style={{ position: 'fixed', top: '56px', left: 0, width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', zIndex: 30 }}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(currentStep / (enabledFields.length + 1)) * 100}%` }}
                style={{ height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))', boxShadow: '0 0 12px var(--accent)' }}
              />
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <AnimatePresence mode="wait">
              {currentStep === 0 && (
                <motion.div 
                  key="intro"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  style={{ textAlign: 'center' }}
                >
                  <div style={{ width: '80px', height: '80px', background: 'rgba(124,58,237,0.1)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', margin: '0 auto 32px', border: '1px solid rgba(124,58,237,0.2)' }}>
                    📝
                  </div>
                  <h1 style={{ fontSize: isMobile ? '32px' : '48px', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '16px', lineHeight: 1.1 }}>
                    {config.title}
                  </h1>
                  <p style={{ fontSize: '18px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '48px', maxWidth: '540px', margin: '0 auto 48px' }}>
                    {config.description}
                  </p>
                  <button className="btn btn-primary btn-lg" onClick={handleNext} style={{ padding: '16px 40px', fontSize: '18px' }}>
                    Start Application
                  </button>
                  <p style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-3)' }}>
                    Press <span style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid var(--border)' }}>Enter ↵</span> to start
                  </p>
                </motion.div>
              )}

              {currentStep > 0 && currentStep <= enabledFields.length && (
                <motion.div 
                  key={enabledFields[currentStep - 1].id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  {(() => {
                    const f = enabledFields[currentStep - 1];
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent-2)', fontFamily: 'var(--mono)' }}>
                            {currentStep.toString().padStart(2, '0')}.
                          </span>
                        </div>
                        
                        <div>
                          <h2 style={{ fontSize: isMobile ? '24px' : '32px', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '12px', lineHeight: 1.2 }}>
                            {f.label} {f.required && <span style={{ color: '#f87171' }}>*</span>}
                          </h2>
                          {f.helpText && (
                            <p style={{ fontSize: '16px', color: 'var(--text-2)', marginBottom: '24px', lineHeight: 1.5 }}>
                              {f.helpText}{' '}
                              {f.linkUrl && <a href={f.linkUrl} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent-2)'}}>{f.linkText||f.linkUrl} ↗</a>}
                            </p>
                          )}
                        </div>

                        <div style={{ fontSize: '20px' }}>
                          <FieldInput field={f} value={data[f.id]??(f.type==='checkbox'?false:'')} onChange={v=>setField(f.id,v)} onFile={file=>handleFile(f.id,file)} uploading={!!fileUploading[f.id]} />
                          
                          {f.id === 'leader_email' && (() => {
                            const newsletterField = config.fields.find(field => field.id === 'newsletter' && field.enabled);
                            if (newsletterField) {
                              return (
                                <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                                  <FieldInput 
                                    field={newsletterField} 
                                    value={data[newsletterField.id]??false} 
                                    onChange={v=>setField(newsletterField.id,v)} 
                                    onFile={async ()=>{}} 
                                    uploading={false}
                                  />
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {errors[f.id] && (
                            <motion.p initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} style={{ fontSize:'14px', color:'#f87171', marginTop:'12px', fontWeight: 500 }}>
                              ⚠ {errors[f.id]}
                            </motion.p>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
                          <button className="btn btn-primary" onClick={handleNext} style={{ padding: '12px 32px' }}>
                            Next
                          </button>
                          <button className="btn btn-ghost" onClick={handleBack} style={{ color: 'var(--text-3)' }}>
                            Back
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              )}

              {currentStep === enabledFields.length + 1 && (
                <motion.div 
                  key="submit"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div style={{ textAlign: 'center', maxWidth: '540px', margin: '0 auto' }}>
                    <div style={{ fontSize: '48px', marginBottom: '24px' }}>✅</div>
                    <h2 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '16px', letterSpacing: '-0.03em' }}>Ready to submit?</h2>
                    <p style={{ fontSize: '16px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '40px' }}>
                      All fields are filled. To store your application permanently on Walrus Mainnet, please connect your wallet and sign the submission.
                    </p>

                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px' }}>
                      {account ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <button className="btn btn-primary btn-lg" style={{ width:'100%' }}
                            onClick={handleSubmit} disabled={status==='signing'||status==='submitting'}>
                            {status==='signing'   ? <><span className="spinner"/> Signing...</>
                             :status==='submitting'? <><span className="spinner"/> Storing on Walrus...</>
                             : 'Sign & Submit Application'}
                          </button>
                          <button className="btn btn-ghost" onClick={handleBack} style={{ color: 'var(--text-3)' }}>
                            Review Answers
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
                          <ConnectButton instance={dAppKit} />
                          <button className="btn btn-ghost btn-sm" onClick={handleBack} style={{ color: 'var(--text-3)' }}>
                            Go Back
                          </button>
                        </div>
                      )}
                    </div>

                    {errMsg && <div className="alert-error" style={{ marginTop:'24px' }}>{errMsg}</div>}

                    <p style={{ marginTop:'32px', fontSize:'12px', color:'var(--text-3)' }}>
                      Stored on <a href="https://walrus.space" target="_blank" rel="noopener noreferrer" style={{color:'var(--text-2)',textDecoration:'none'}}>Walrus</a> - Decentralised - No server
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </ClientOnly>
  );
}
