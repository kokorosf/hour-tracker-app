'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Calendar,
  UserPlus,
  FolderTree,
  BarChart3,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Nav item definitions
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: '/dashboard',           icon: Home        },
  { label: 'Calendar',   href: '/dashboard/calendar',  icon: Calendar    },
  { label: 'Manage',     href: '/dashboard/manage',    icon: FolderTree, adminOnly: true },
  { label: 'Users',      href: '/dashboard/users',     icon: UserPlus,   adminOnly: true },
  { label: 'Reports',    href: '/dashboard/reports',   icon: BarChart3   },
  { label: 'Settings',   href: '/dashboard/settings',  icon: Settings    },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'admin' | 'user';
  badges?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Sidebar({ isOpen, onClose, userRole, badges = {} }: SidebarProps) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || userRole === 'admin',
  );

  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  const navContent = (
    <nav
      className="flex flex-1 flex-col gap-0 overflow-y-auto py-3"
      aria-label="Main"
    >
      {visibleItems.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        const badgeCount = badges[item.href];

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={[
              'group flex items-center gap-3 px-4 py-2.5 text-xs font-bold tracking-widest uppercase',
              'transition-colors duration-100 border-l-2',
              active
                ? 'border-[#7bc8e0] bg-white/10 text-[#7bc8e0]'
                : 'border-transparent text-[#b8e4f4]/60 hover:bg-white/5 hover:text-[#b8e4f4]',
            ].join(' ')}
            style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif' }}
            aria-current={active ? 'page' : undefined}
          >
            <Icon
              className={[
                'h-4 w-4 shrink-0 transition-colors duration-100',
                active ? 'text-[#7bc8e0]' : 'text-[#b8e4f4]/40 group-hover:text-[#b8e4f4]/70',
              ].join(' ')}
              aria-hidden="true"
            />
            <span className="flex-1">{item.label}</span>
            {badgeCount !== undefined && badgeCount > 0 && (
              <span
                className={[
                  'ml-auto inline-flex h-5 min-w-[20px] items-center justify-center px-1.5 text-xs font-bold',
                  active
                    ? 'bg-[#7bc8e0] text-[#111c30]'
                    : 'bg-white/10 text-[#b8e4f4]',
                ].join(' ')}
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarClasses = 'flex flex-col border-r-4 border-[#7bc8e0]';
  const sidebarStyle = { backgroundColor: '#111c30' };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={[
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 lg:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <aside
        className={[
          `fixed inset-y-0 left-0 z-50 w-64 ${sidebarClasses}`,
          'transition-transform duration-200 ease-in-out lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        style={sidebarStyle}
      >
        <div
          className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4"
        >
          <span
            className="text-xl font-extrabold uppercase tracking-widest text-white"
            style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif' }}
          >
            Pure Track
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-none p-1 text-[#b8e4f4]/50 hover:text-[#7bc8e0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7bc8e0]"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-64 ${sidebarClasses}`}
        style={sidebarStyle}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-4">
          <span
            className="text-xl font-extrabold uppercase tracking-widest text-white"
            style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif' }}
          >
            Pure Track
          </span>
        </div>
        {navContent}
      </aside>
    </>
  );
}
