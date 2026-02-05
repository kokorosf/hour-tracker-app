'use client';

import { useState, type ReactNode } from 'react';
import Sidebar from './sidebar';
import Topbar from './topbar';

export interface DashboardShellProps {
  children: ReactNode;
  email: string;
  role: 'admin' | 'user';
  tenantName?: string;
}

export default function DashboardShell({
  children,
  email,
  role,
  tenantName,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        role={role}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area — offset by sidebar width on desktop */}
      <div className="lg:pl-64">
        <Topbar
          email={email}
          tenantName={tenantName}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
        />

        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
