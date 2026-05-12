import type { Metadata } from 'next';
import './globals.css';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { NavbarWrapper } from '@/components/NavbarWrapper';

export const metadata: Metadata = {
  title: 'Walform — Decentralized Feedback Platform',
  description: 'Create forms, collect feedback, and store everything on Walrus. Built for the Sui ecosystem.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..900;1,14..32,300..900&display=swap" rel="stylesheet" />
        <style>{`.hide-mobile{} .show-mobile{display:none!important;} @media(max-width:640px){.hide-mobile{display:none!important;}.show-mobile{display:flex!important;}} .mono{font-family:var(--mono)} .addr-chip{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.04);cursor:pointer;color:var(--text-2);transition:all 0.15s;} .addr-chip:hover{border-color:var(--accent-soft);background:rgba(139,92,246,0.06);} .addr-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;flex-shrink:0;} .star-btn{background:none;border:none;padding:2px;cursor:pointer;line-height:1;} .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:60px 24px;color:var(--text-3);font-size:14px;text-align:center;}`}</style>
      </head>
      <body>
        <ClientProviders>
          <NavbarWrapper />
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
