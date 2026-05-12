'use client';
import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';

// Hide global navbar on /admin (uses its own layout) and on /f/ routes
const NAVBAR_EXCLUDED = ['/admin'];

export function NavbarWrapper() {
  const pathname = usePathname();
  const hidden = NAVBAR_EXCLUDED.some(p => pathname.startsWith(p));
  if (hidden) return null;
  return <Navbar />;
}
