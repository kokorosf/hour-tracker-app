'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api/client';
import { useToast } from '@/../components/ui/toast';
import Button from '@/../components/ui/button';
import Modal from '@/../components/ui/modal';
import ClientModal, { type ClientForModal } from '@/../components/dashboard/client-modal';
import { Search, Plus, Pencil, Trash2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  name: string;
  projectCount: number;
  createdAt: string;
}

interface PaginatedClients {
  items: ClientRow[];
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

const fetcher = (url: string) => api.get<PaginatedClients>(url);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClientsPage() {
  const { showToast } = useToast();

  // Search / pagination state.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [editClient, setEditClient] = useState<ClientForModal | null>(null);

  // Delete confirmation state.
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce search input.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Build SWR key.
  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (debouncedSearch) params.set('search', debouncedSearch);
    return `/api/clients?${params.toString()}`;
  }, [page, debouncedSearch]);

  const { data, isLoading, mutate } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleAdd = useCallback(() => {
    setEditClient(null);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((client: ClientRow) => {
    setEditClient({ id: client.id, name: client.name });
    setModalOpen(true);
  }, []);

  const handleSaved = useCallback(() => {
    mutate();
  }, [mutate]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await api.delete(`/api/clients/${deleteTarget.id}`);
      showToast('Client deleted.', 'success');
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      showToast((err as Error).message || 'Failed to delete client.', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, mutate, showToast]);

  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const { items = [], pagination } = data ?? {};

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <Button onClick={handleAdd} size="sm">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Add Client
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="block w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
        />
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
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    # Projects
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
                      {debouncedSearch ? 'No clients match your search.' : 'No clients yet. Add your first client to get started.'}
                    </td>
                  </tr>
                ) : (
                  items.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {client.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {client.projectCount}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {formatDate(client.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(client)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label={`Edit ${client.name}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(client)}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            aria-label={`Delete ${client.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
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
              <p className="py-10 text-center text-sm text-gray-500">
                {debouncedSearch ? 'No clients match your search.' : 'No clients yet. Add your first client to get started.'}
              </p>
            ) : (
              items.map((client) => (
                <div
                  key={client.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{client.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {client.projectCount} project{client.projectCount !== 1 ? 's' : ''} &middot; Created {formatDate(client.createdAt)}
                      </p>
                    </div>
                    <div className="ml-3 flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(client)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label={`Edit ${client.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(client)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        aria-label={`Delete ${client.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
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

      {/* Create / Edit modal */}
      <ClientModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        client={editClient}
      />

      {/* Delete confirmation dialog */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Client"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm} loading={deleting}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to delete{' '}
          <span className="font-medium text-gray-900">{deleteTarget?.name}</span>? This action
          cannot be undone.
        </p>
      </Modal>
    </>
  );
}
