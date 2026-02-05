'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api/client';
import { useToast } from '@/../components/ui/toast';
import Button from '@/../components/ui/button';
import Modal from '@/../components/ui/modal';
import ProjectForm, { type ProjectForForm } from '@/../components/projects/project-form';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  isBillable: boolean;
  taskCount: number;
  createdAt: string;
}

interface PaginatedProjects {
  items: ProjectRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface ClientOption {
  id: string;
  name: string;
}

interface PaginatedClients {
  items: ClientOption[];
  pagination: { total: number };
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const { showToast } = useToast();

  // Filter / pagination state.
  const [clientFilter, setClientFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectForForm | null>(null);

  // Delete confirmation state.
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch clients for the filter dropdown.
  const { data: clientData } = useSWR<PaginatedClients>(
    '/api/clients?pageSize=100',
    fetcher,
    { revalidateOnFocus: false },
  );
  const clients = clientData?.items ?? [];

  // Reset page when filter changes.
  useEffect(() => {
    setPage(1);
  }, [clientFilter]);

  // Build SWR key.
  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (clientFilter) params.set('clientId', clientFilter);
    return `/api/projects?${params.toString()}`;
  }, [page, clientFilter]);

  const { data, isLoading, mutate } = useSWR<PaginatedProjects>(swrKey, fetcher, {
    revalidateOnFocus: false,
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleAdd = useCallback(() => {
    setEditProject(null);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((p: ProjectRow) => {
    setEditProject({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      isBillable: p.isBillable,
    });
    setModalOpen(true);
  }, []);

  const handleSaved = useCallback(() => {
    mutate();
  }, [mutate]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await api.delete(`/api/projects/${deleteTarget.id}`);
      showToast('Project deleted.', 'success');
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      showToast((err as Error).message || 'Failed to delete project.', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, mutate, showToast]);

  const { items = [], pagination } = data ?? {};

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <Button onClick={handleAdd} size="sm">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Add Project
        </Button>
      </div>

      {/* Filter by client */}
      <div className="mb-4 max-w-xs">
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Billable
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    # Tasks
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                      {clientFilter ? 'No projects match this filter.' : 'No projects yet. Add your first project to get started.'}
                    </td>
                  </tr>
                ) : (
                  items.map((project) => (
                    <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {project.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {project.clientName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {project.isBillable ? (
                          <Check className="h-4 w-4 text-green-600" aria-label="Yes" />
                        ) : (
                          <X className="h-4 w-4 text-gray-400" aria-label="No" />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {project.taskCount}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(project)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label={`Edit ${project.name}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(project)}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            aria-label={`Delete ${project.name}`}
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
                {clientFilter ? 'No projects match this filter.' : 'No projects yet. Add your first project to get started.'}
              </p>
            ) : (
              items.map((project) => (
                <div
                  key={project.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{project.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {project.clientName} &middot; {project.taskCount} task{project.taskCount !== 1 ? 's' : ''}
                        {project.isBillable && ' &middot; Billable'}
                      </p>
                    </div>
                    <div className="ml-3 flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(project)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label={`Edit ${project.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(project)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        aria-label={`Delete ${project.name}`}
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

      {/* Create / Edit form */}
      <ProjectForm
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSaved}
        project={editProject}
      />

      {/* Delete confirmation dialog */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Project"
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
          <span className="font-medium text-gray-900">{deleteTarget?.name}</span>? All tasks
          under this project will also be deleted. This action cannot be undone.
        </p>
      </Modal>
    </>
  );
}
