'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Sidebar from './sidebar';
import Topbar from './topbar';
import TimerBar from './timer-bar';

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
  const [timerSetupOpen, setTimerSetupOpen] = useState(false);

  // Check if a timer is already running (persisted in localStorage).
  const [hasRunningTimer, setHasRunningTimer] = useState(false);

  useEffect(() => {
    setHasRunningTimer(localStorage.getItem('hour-tracker-timer') !== null);
  }, []);

  const handleStartTimer = useCallback(() => {
    setTimerSetupOpen(true);
  }, []);

  const handleSetupDismiss = useCallback(() => {
    setTimerSetupOpen(false);
  }, []);

  // Timer bar is visible when setup is open or a timer is running.
  const timerVisible = timerSetupOpen || hasRunningTimer;

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        userRole={role}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area — offset by sidebar width on desktop */}
      <div className="lg:pl-64">
        <Topbar
          email={email}
          tenantName={tenantName}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
          onStartTimer={handleStartTimer}
        />

        <main className={['p-4 lg:p-6', timerVisible ? 'pb-24' : ''].join(' ')}>
          {children}
        </main>
      </div>

      <TimerBar
        showSetup={timerSetupOpen}
        onSetupDismiss={handleSetupDismiss}
      />
    </div>
  );
}
