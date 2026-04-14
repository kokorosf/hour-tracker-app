'use client';

import { signOut } from 'next-auth/react';
import { Play } from 'lucide-react';

export interface TopbarProps {
  email: string;
  tenantName?: string;
  onMenuToggle: () => void;
  onStartTimer?: () => void;
}

export default function Topbar({ email, tenantName, onMenuToggle, onStartTimer }: TopbarProps) {
  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b px-4 lg:px-6"
      style={{
        backgroundColor: 'var(--color-card)',
        borderColor: 'var(--color-border-light)',
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={onMenuToggle}
        className="rounded-none p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7bc8e0] lg:hidden"
        style={{ color: 'var(--color-muted)' }}
        aria-label="Open sidebar"
      >
        <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* App name — mobile only */}
      <span
        className="text-lg font-extrabold uppercase tracking-widest lg:hidden"
        style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', color: 'var(--color-navy)' }}
      >
        Pure Track
      </span>

      <div className="flex-1" />

      {/* Start Timer */}
      {onStartTimer && (
        <button
          type="button"
          onClick={onStartTimer}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7bc8e0]"
          style={{
            fontFamily: 'var(--font-barlow-condensed), sans-serif',
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-navy)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent-dark)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent)')}
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Start Timer</span>
        </button>
      )}

      {/* Tenant name */}
      {tenantName && (
        <span
          className="hidden text-xs font-semibold uppercase tracking-widest sm:block"
          style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', color: 'var(--color-muted)' }}
        >
          {tenantName}
        </span>
      )}

      {/* Divider */}
      {tenantName && (
        <div className="hidden h-5 w-px sm:block" style={{ backgroundColor: 'var(--color-border-light)' }} aria-hidden="true" />
      )}

      {/* User email */}
      <span
        className="truncate text-sm font-medium max-w-[200px]"
        style={{ color: 'var(--color-text)' }}
      >
        {email}
      </span>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7bc8e0]"
        style={{
          fontFamily: 'var(--font-barlow-condensed), sans-serif',
          color: 'var(--color-muted)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--color-border-light)';
          e.currentTarget.style.color = 'var(--color-text)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--color-muted)';
        }}
      >
        Log out
      </button>
    </header>
  );
}
