'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api/client';
import { useToast } from '@/../components/ui/toast';
import Button from '@/../components/ui/button';
import Modal from '@/../components/ui/modal';
import InviteUserForm from '@/../components/users/invite-user-form';
import { Plus, Shield, ShieldOff, UserX } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
}

interface CurrentUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

interface PaginatedUsers {
  items: UserRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { showToast } = useToast();

  // Pagination state.
  const [page, setPage] = useState(1);

  // Modal state.
  const [inviteOpen, setInviteOpen] = useState(false);

  // Role change confirmation state.
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [changingRole, setChangingRole] = useState(false);

  // Deactivate confirmation state.
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Fetch current user to know who "me" is.
  const { data: meData } = useSWR<CurrentUser>('/api/users/me', fetcher, {
    revalidateOnFocus: false,
  });

  // Build SWR key.
  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    return `/api/users?${params.toString()}`;
  }, [page]);

  const { data, isLoading, mutate } = useSWR<PaginatedUsers>(swrKey, fetcher, {
    revalidateOnFocus: false,
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleInvited = useCallback(() => {
    mutate();
  }, [mutate]);

  const handleRoleConfirm = useCallback(async () => {
    if (!roleTarget) return;

    const newRole = roleTarget.role === 'admin' ? 'user' : 'admin';
    setChangingRole(true);

    try {
      await api.put(`/api/users/${roleTarget.id}`, { role: newRole });
      showToast(`Role changed to ${newRole}.`, 'success');
      setRoleTarget(null);
      mutate();
    } catch (err) {
      showToast((err as Error).message || 'Failed to change role.', 'error');
    } finally {
      setChangingRole(false);
    }
  }, [roleTarget, mutate, showToast]);

  const handleDeactivateConfirm = useCallback(async () => {
    if (!deactivateTarget) return;

    setDeactivating(true);
    try {
      await api.delete(`/api/users/${deactivateTarget.id}`);
      showToast('User deactivated.', 'success');
      setDeactivateTarget(null);
      mutate();
    } catch (err) {
      showToast((err as Error).message || 'Failed to deactivate user.', 'error');
    } finally {
      setDeactivating(false);
    }
  }, [deactivateTarget, mutate, showToast]);

  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const isMe = useCallback(
    (userId: string) => meData?.id === userId,
    [meData],
  );

  const { items = [], pagination } = data ?? {};

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <Button onClick={() => setInviteOpen(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Invite User
        </Button>
      </div>

      {/* Loading skeleton */}
      {isLoading && !data && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
      )}

      {/* Table */}
      {data && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-gray-200 shadow-sm sm:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  items.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {user.email}
                        {isMe(user.id) && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            You
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
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
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        {!isMe(user.id) && (
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              onClick={() => setRoleTarget(user)}
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              aria-label={`Change ${user.email} role to ${user.role === 'admin' ? 'user' : 'admin'}`}
                              title={user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                            >
                              {user.role === 'admin' ? (
                                <ShieldOff className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <Shield className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeactivateTarget(user)}
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                              aria-label={`Deactivate ${user.email}`}
                            >
                              <UserX className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {items.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">No users found.</p>
            ) : (
              items.map((user) => (
                <div
                  key={user.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {user.email}
                        {isMe(user.id) && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            You
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        <span
                          className={[
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mr-1',
                            user.role === 'admin'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-700',
                          ].join(' ')}
                        >
                          {user.role}
                        </span>
                        &middot; Joined {formatDate(user.createdAt)}
                      </p>
                    </div>
                    {!isMe(user.id) && (
                      <div className="ml-3 flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => setRoleTarget(user)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          aria-label={`Change ${user.email} role`}
                        >
                          {user.role === 'admin' ? (
                            <ShieldOff className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Shield className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeactivateTarget(user)}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          aria-label={`Deactivate ${user.email}`}
                        >
                          <UserX className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
              <p className="text-sm text-gray-600">
                Showing {(pagination.page - 1) * pagination.pageSize + 1}–
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
                {pagination.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Invite modal */}
      <InviteUserForm
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={handleInvited}
      />

      {/* Change role confirmation */}
      <Modal
        isOpen={roleTarget !== null}
        onClose={() => setRoleTarget(null)}
        title="Change Role"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setRoleTarget(null)}
              disabled={changingRole}
            >
              Cancel
            </Button>
            <Button onClick={handleRoleConfirm} loading={changingRole}>
              Confirm
            </Button>
          </div>
        }
      >
        {roleTarget && (
          <p className="text-sm text-gray-600">
            Change <span className="font-medium text-gray-900">{roleTarget.email}</span> from{' '}
            <span className="font-medium">{roleTarget.role}</span> to{' '}
            <span className="font-medium">{roleTarget.role === 'admin' ? 'user' : 'admin'}</span>?
          </p>
        )}
      </Modal>

      {/* Deactivate confirmation */}
      <Modal
        isOpen={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate User"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setDeactivateTarget(null)}
              disabled={deactivating}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeactivateConfirm} loading={deactivating}>
              Deactivate
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to deactivate{' '}
          <span className="font-medium text-gray-900">{deactivateTarget?.email}</span>? They will
          no longer be able to sign in. This action cannot be undone.
        </p>
      </Modal>
    </>
  );
}
