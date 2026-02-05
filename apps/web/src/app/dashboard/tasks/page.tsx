'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api/client';
import { useToast } from '@/../components/ui/toast';
import Button from '@/../components/ui/button';
import Modal from '@/../components/ui/modal';
import TaskForm, { type TaskForForm } from '@/../components/tasks/task-form';
import { Plus, Pencil, Trash2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  clientName: string;
  createdAt: string;
}

interface PaginatedTasks {
  items: TaskRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface ProjectOption {
  id: string;
  name: string;
  clientName: string;
}

interface PaginatedProjects {
  items: ProjectOption[];
  pagination: { total: number };
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const { showToast } = useToast();

  // Filter / pagination state.
  const [projectFilter, setProjectFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskForForm | null>(null);

  // Delete confirmation state.
  const [deleteTarget, setDeleteTarget] = useState<TaskRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch projects for the filter dropdown.
  const { data: projectData } = useSWR<PaginatedProjects>(
    '/api/projects?pageSize=100',
    fetcher,
    { revalidateOnFocus: false },
  );
  const projects = projectData?.items ?? [];

  // Reset page when filter changes.
  useEffect(() => {
    setPage(1);
  }, [projectFilter]);

  // Build SWR key.
  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (projectFilter) params.set('projectId', projectFilter);
    return `/api/tasks?${params.toString()}`;
  }, [page, projectFilter]);

  const { data, isLoading, mutate } = useSWR<PaginatedTasks>(swrKey, fetcher, {
    revalidateOnFocus: false,
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleAdd = useCallback(() => {
    setEditTask(null);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((t: TaskRow) => {
    setEditTask({
      id: t.id,
      name: t.name,
      projectId: t.projectId,
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
      await api.delete(`/api/tasks/${deleteTarget.id}`);
      showToast('Task deleted.', 'success');
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      showToast((err as Error).message || 'Failed to delete task.', 'error');
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
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <Button onClick={handleAdd} size="sm">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Add Task
        </Button>
      </div>

      {/* Filter by project */}
      <div className="mb-4 max-w-xs">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.clientName})
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
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Client
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
                      {projectFilter ? 'No tasks match this filter.' : 'No tasks yet. Add your first task to get started.'}
                    </td>
                  </tr>
                ) : (
                  items.map((task) => (
                    <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {task.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {task.projectName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {task.clientName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(task)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label={`Edit ${task.name}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(task)}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            aria-label={`Delete ${task.name}`}
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
                {projectFilter ? 'No tasks match this filter.' : 'No tasks yet. Add your first task to get started.'}
              </p>
            ) : (
              items.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{task.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {task.projectName} &middot; {task.clientName}
                      </p>
                    </div>
                    <div className="ml-3 flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(task)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label={`Edit ${task.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(task)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        aria-label={`Delete ${task.name}`}
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
      <TaskForm
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSaved}
        task={editTask}
      />

      {/* Delete confirmation dialog */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Task"
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
