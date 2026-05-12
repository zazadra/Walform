'use client';
import { useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

function shorten(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

export function Navbar() {
  const account = useCurrentAccount();
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const NAV = [
    { href: '/builder', label: 'Builder' },
    { href: '/templates', label: 'Templates' },
    { href: '/admin', label: 'Admin' },
  ];

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      borderBottom: '1px solid var(--border)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      background: 'rgba(5,6,11,0.85)',
    }}>
      <div style={{
        maxWidth: '1400px', margin: '0 auto',
        padding: '0 24px', height: '56px',
        display: 'flex', alignItems: 'center', gap: '0',
      }}>
        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginRight: '32px' }}>
          <motion.img
            src="/walform-mascot.png"
            alt="Walform"
            style={{ height: '32px', width: 'auto', filter: 'drop-shadow(0 0 8px rgba(124,58,237,0.4))' }}
            whileHover={{ scale: 1.1, rotate: -5 }}
            transition={{ type: 'spring', stiffness: 300 }}
          />
          <span style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff' }}>
            Walform
          </span>
        </a>

        {/* Nav Links – desktop */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1 }} className="hide-mobile">
          {NAV.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: isActive(href) ? 700 : 500,
                color: isActive(href) ? 'var(--accent-2)' : 'var(--text-2)',
                textDecoration: 'none',
                background: isActive(href) ? 'rgba(139,92,246,0.1)' : 'transparent',
                border: `1px solid ${isActive(href) ? 'rgba(139,92,246,0.25)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (!isActive(href)) {
                  e.currentTarget.style.color = 'var(--text-1)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive(href)) {
                  e.currentTarget.style.color = 'var(--text-2)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
          {account ? (
            <>
              <button
                onClick={() => { navigator.clipboard.writeText(account.address); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                className="addr-chip hide-mobile"
                title="Copy address"
              >
                <span className="addr-dot anim-pulse" />
                <span className="mono" style={{ fontSize: '13px' }}>{shorten(account.address)}</span>
                {copied && <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 700 }}>✓</span>}
              </button>
              <button
                onClick={() => dAppKit.disconnectWallet()}
                style={{
                  fontSize: '13px', fontWeight: 600, color: 'var(--text-3)',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', transition: 'all 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
              >
                Sign Out
              </button>
            </>
          ) : (
            <ConnectButton instance={dAppKit} />
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{ display: 'none', background: 'none', border: 'none', color: 'var(--text-1)', cursor: 'pointer', padding: '4px' }}
            className="show-mobile"
            aria-label="Menu"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ borderTop: '1px solid var(--border)', background: 'rgba(5,6,11,0.95)', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: '4px' }}
          >
            {NAV.map(({ href, label }) => (
              <a key={href} href={href} style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '15px', fontWeight: 600, color: isActive(href) ? 'var(--accent-2)' : 'var(--text-2)', textDecoration: 'none' }}>
                {label}
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
