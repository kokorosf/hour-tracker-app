'use client';

import { signOut } from 'next-auth/react';

export interface TopbarProps {
  email: string;
  tenantName?: string;
  onMenuToggle: () => void;
}

export default function Topbar({ email, tenantName, onMenuToggle }: TopbarProps) {
  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:px-6">
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={onMenuToggle}
        className="rounded-md p-1.5 text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:hidden"
        aria-label="Open sidebar"
      >
        <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* App name — mobile only (desktop has it in sidebar) */}
      <span className="text-lg font-bold text-gray-900 lg:hidden">Hour Tracker</span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Tenant name */}
      {tenantName && (
        <span className="hidden text-sm text-gray-500 sm:block">{tenantName}</span>
      )}

      {/* Divider */}
      {tenantName && (
        <div className="hidden h-6 w-px bg-gray-200 sm:block" aria-hidden="true" />
      )}

      {/* User email */}
      <span className="truncate text-sm font-medium text-gray-700 max-w-[200px]">
        {email}
      </span>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        Log out
      </button>
    </header>
  );
}
