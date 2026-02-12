'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Calendar,
  Users,
  UserPlus,
  Briefcase,
  CheckSquare,
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
  { label: 'Clients',    href: '/dashboard/clients',   icon: Users,      adminOnly: true },
  { label: 'Projects',   href: '/dashboard/projects',  icon: Briefcase,  adminOnly: true },
  { label: 'Tasks',      href: '/dashboard/tasks',     icon: CheckSquare, adminOnly: true },
  { label: 'Users',      href: '/dashboard/users',     icon: UserPlus,    adminOnly: true },
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
  /** Optional badge counts keyed by nav href, e.g. { '/dashboard/tasks': 5 } */
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
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Main">
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
              'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
              'transition-colors duration-150',
              active
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
            ].join(' ')}
            aria-current={active ? 'page' : undefined}
          >
            <Icon
              className={[
                'h-5 w-5 shrink-0 transition-colors duration-150',
                active
                  ? 'text-blue-600'
                  : 'text-gray-400 group-hover:text-gray-600',
              ].join(' ')}
              aria-hidden="true"
            />
            <span className="flex-1">{item.label}</span>
            {badgeCount !== undefined && badgeCount > 0 && (
              <span
                className={[
                  'ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700',
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

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={[
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white',
          'transition-transform duration-200 ease-in-out lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 px-4">
          <span className="text-lg font-bold text-gray-900">Hour Tracker</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white">
        <div className="flex h-16 shrink-0 items-center border-b border-gray-200 px-4">
          <span className="text-lg font-bold text-gray-900">Hour Tracker</span>
        </div>
        {navContent}
      </aside>
    </>
  );
}
