'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api/client';
import { useToast } from '@/../components/ui/toast';
import Button from '@/../components/ui/button';
import Input from '@/../components/ui/input';
import { User, Lock, Building2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CurrentUser {
  id: string;
  email: string;
  tenantId: string;
  role: 'admin' | 'user';
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { showToast } = useToast();

  const { data: user, isLoading } = useSWR<CurrentUser>('/api/users/me', fetcher, {
    revalidateOnFocus: false,
  });

  // Password form state.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const handlePasswordChange = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setPasswordError('');

      if (newPassword !== confirmPassword) {
        setPasswordError('Passwords do not match.');
        return;
      }

      setChangingPassword(true);
      try {
        await api.put('/api/users/me/password', {
          currentPassword,
          newPassword,
        });
        showToast('Password updated successfully.', 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } catch (err) {
        const message = (err as Error).message || 'Failed to update password.';
        setPasswordError(message);
        showToast(message, 'error');
      } finally {
        setChangingPassword(false);
      }
    },
    [currentPassword, newPassword, confirmPassword, showToast],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

      {/* Loading skeleton */}
      {isLoading && !user && (
        <div className="space-y-6">
          <div className="h-48 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
        </div>
      )}

      {user && (
        <div className="space-y-6">
          {/* Profile section */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-gray-500" />
                <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
              </div>
            </div>
            <div className="px-6 py-5">
              <dl className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:gap-4">
                  <dt className="text-sm font-medium text-gray-500 sm:w-40">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0">{user.email}</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:gap-4">
                  <dt className="text-sm font-medium text-gray-500 sm:w-40">Role</dt>
                  <dd className="mt-1 sm:mt-0">
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700',
                      ].join(' ')}
                    >
                      {user.role}
                    </span>
                  </dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:gap-4">
                  <dt className="text-sm font-medium text-gray-500 sm:w-40">Tenant ID</dt>
                  <dd className="mt-1 text-sm font-mono text-gray-600 sm:mt-0">
                    {user.tenantId}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Change password section */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-gray-500" />
                <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
              </div>
            </div>
            <form onSubmit={handlePasswordChange} className="px-6 py-5">
              <div className="max-w-md space-y-4">
                <Input
                  label="Current password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={changingPassword}
                />
                <Input
                  label="New password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={changingPassword}
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={changingPassword}
                  error={passwordError || undefined}
                />
                <p className="text-xs text-gray-500">
                  Min 8 characters, one uppercase letter, and one number.
                </p>
                <Button type="submit" loading={changingPassword} size="sm">
                  Update Password
                </Button>
              </div>
            </form>
          </div>

          {/* About section */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-gray-500" />
                <h2 className="text-lg font-semibold text-gray-900">About</h2>
              </div>
            </div>
            <div className="px-6 py-5">
              <dl className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:gap-4">
                  <dt className="text-sm font-medium text-gray-500 sm:w-40">Application</dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0">Hour Tracker</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:gap-4">
                  <dt className="text-sm font-medium text-gray-500 sm:w-40">Version</dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0">0.1.0</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
