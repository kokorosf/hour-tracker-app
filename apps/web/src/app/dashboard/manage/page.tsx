'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api/client';
import { useToast } from '@/../components/ui/toast';
import Button from '@/../components/ui/button';
import Modal from '@/../components/ui/modal';
import ClientForm from '@/../components/clients/client-form';
import ProjectForm, { type ProjectForForm } from '@/../components/projects/project-form';
import TaskForm, { type TaskForForm } from '@/../components/tasks/task-form';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  Briefcase,
  CheckSquare,
  Users,
  Check,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  name: string;
  projectCount: number;
  createdAt: string;
}

interface ProjectRow {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  isBillable: boolean;
  taskCount: number;
  createdAt: string;
}

interface TaskRow {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  clientName: string;
  createdAt: string;
}

interface PaginatedResponse<T> {
  items: T[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ManagePage() {
  const { showToast } = useToast();

  // Expanded state — track which clients and projects are expanded.
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Modal state — which form is open and what entity.
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editClient, setEditClient] = useState<ClientRow | null>(null);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectForForm | null>(null);
  const [addProjectClientId, setAddProjectClientId] = useState<string>('');

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskForForm | null>(null);
  const [addTaskProjectId, setAddTaskProjectId] = useState<string>('');

  // Delete confirmation.
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'client' | 'project' | 'task';
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const { data: clientData, mutate: mutateClients } = useSWR<PaginatedResponse<ClientRow>>(
    '/api/clients?pageSize=100',
    fetcher,
    { revalidateOnFocus: false },
  );

  const { data: projectData, mutate: mutateProjects } = useSWR<PaginatedResponse<ProjectRow>>(
    '/api/projects?pageSize=200',
    fetcher,
    { revalidateOnFocus: false },
  );

  const { data: taskData, mutate: mutateTasks } = useSWR<PaginatedResponse<TaskRow>>(
    '/api/tasks?pageSize=500',
    fetcher,
    { revalidateOnFocus: false },
  );

  const clients = clientData?.items ?? [];
  const projects = projectData?.items ?? [];
  const tasks = taskData?.items ?? [];

  // Group projects by clientId and tasks by projectId.
  const projectsByClient = new Map<string, ProjectRow[]>();
  for (const p of projects) {
    const list = projectsByClient.get(p.clientId) ?? [];
    list.push(p);
    projectsByClient.set(p.clientId, list);
  }

  const tasksByProject = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const list = tasksByProject.get(t.projectId) ?? [];
    list.push(t);
    tasksByProject.set(t.projectId, list);
  }

  // ---------------------------------------------------------------------------
  // Toggle expand/collapse
  // ---------------------------------------------------------------------------

  const toggleClient = useCallback((id: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleProject = useCallback((id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const refreshAll = useCallback(() => {
    mutateClients();
    mutateProjects();
    mutateTasks();
  }, [mutateClients, mutateProjects, mutateTasks]);

  // Client
  const handleAddClient = useCallback(() => {
    setEditClient(null);
    setClientModalOpen(true);
  }, []);

  const handleEditClient = useCallback((c: ClientRow) => {
    setEditClient(c);
    setClientModalOpen(true);
  }, []);

  // Project
  const handleAddProject = useCallback((clientId?: string) => {
    setEditProject(null);
    setAddProjectClientId(clientId ?? '');
    setProjectModalOpen(true);
  }, []);

  const handleEditProject = useCallback((p: ProjectRow) => {
    setEditProject({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      isBillable: p.isBillable,
    });
    setAddProjectClientId('');
    setProjectModalOpen(true);
  }, []);

  // Task
  const handleAddTask = useCallback((projectId?: string) => {
    setEditTask(null);
    setAddTaskProjectId(projectId ?? '');
    setTaskModalOpen(true);
  }, []);

  const handleEditTask = useCallback((t: TaskRow) => {
    setEditTask({
      id: t.id,
      name: t.name,
      projectId: t.projectId,
    });
    setAddTaskProjectId('');
    setTaskModalOpen(true);
  }, []);

  // Delete
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/${deleteTarget.type}s/${deleteTarget.id}`);
      showToast(
        `${deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1)} deleted.`,
        'success',
      );
      setDeleteTarget(null);
      refreshAll();
    } catch (err) {
      showToast((err as Error).message || 'Failed to delete.', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, refreshAll, showToast]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isLoading = !clientData || !projectData || !taskData;

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Manage</h1>
        <div className="flex gap-2">
          <Button onClick={handleAddClient} size="sm" variant="secondary">
            <Plus className="mr-1 h-4 w-4" />
            Client
          </Button>
          <Button onClick={() => handleAddProject()} size="sm" variant="secondary">
            <Plus className="mr-1 h-4 w-4" />
            Project
          </Button>
          <Button onClick={() => handleAddTask()} size="sm" variant="secondary">
            <Plus className="mr-1 h-4 w-4" />
            Task
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
      )}

      {/* Tree view */}
      {!isLoading && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {clients.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-500">
              No clients yet. Add your first client to get started.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {clients.map((client) => {
                const clientExpanded = expandedClients.has(client.id);
                const clientProjects = projectsByClient.get(client.id) ?? [];

                return (
                  <div key={client.id}>
                    {/* Client row */}
                    <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <button
                        type="button"
                        onClick={() => toggleClient(client.id)}
                        className="rounded p-0.5 text-gray-400 hover:text-gray-600"
                        aria-label={clientExpanded ? 'Collapse' : 'Expand'}
                      >
                        {clientExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <Users className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="flex-1 text-sm font-semibold text-gray-900">
                        {client.name}
                      </span>
                      <span className="text-xs text-gray-500 mr-2">
                        {clientProjects.length} project{clientProjects.length !== 1 ? 's' : ''}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleAddProject(client.id)}
                          className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                          aria-label={`Add project to ${client.name}`}
                          title="Add project"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditClient(client)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          aria-label={`Edit ${client.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ type: 'client', id: client.id, name: client.name })
                          }
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${client.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Projects under this client */}
                    {clientExpanded && (
                      <div>
                        {clientProjects.length === 0 ? (
                          <div className="py-2 pl-14 pr-4 text-xs text-gray-400 italic">
                            No projects
                          </div>
                        ) : (
                          clientProjects.map((project) => {
                            const projectExpanded = expandedProjects.has(project.id);
                            const projectTasks = tasksByProject.get(project.id) ?? [];

                            return (
                              <div key={project.id}>
                                {/* Project row */}
                                <div className="flex items-center gap-2 py-2.5 pl-10 pr-4 hover:bg-gray-50 transition-colors">
                                  <button
                                    type="button"
                                    onClick={() => toggleProject(project.id)}
                                    className="rounded p-0.5 text-gray-400 hover:text-gray-600"
                                    aria-label={projectExpanded ? 'Collapse' : 'Expand'}
                                  >
                                    {projectExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <Briefcase className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                                  <span className="flex-1 text-sm font-medium text-gray-800">
                                    {project.name}
                                  </span>
                                  {project.isBillable ? (
                                    <span className="mr-2 inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                                      <Check className="mr-0.5 h-3 w-3" />
                                      Billable
                                    </span>
                                  ) : (
                                    <span className="mr-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                                      <X className="mr-0.5 h-3 w-3" />
                                      Non-billable
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500 mr-2">
                                    {projectTasks.length} task{projectTasks.length !== 1 ? 's' : ''}
                                  </span>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleAddTask(project.id)}
                                      className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                      aria-label={`Add task to ${project.name}`}
                                      title="Add task"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleEditProject(project)}
                                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                      aria-label={`Edit ${project.name}`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDeleteTarget({
                                          type: 'project',
                                          id: project.id,
                                          name: project.name,
                                        })
                                      }
                                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                      aria-label={`Delete ${project.name}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Tasks under this project */}
                                {projectExpanded && (
                                  <div>
                                    {projectTasks.length === 0 ? (
                                      <div className="py-2 pl-24 pr-4 text-xs text-gray-400 italic">
                                        No tasks
                                      </div>
                                    ) : (
                                      projectTasks.map((task) => (
                                        <div
                                          key={task.id}
                                          className="flex items-center gap-2 py-2 pl-20 pr-4 hover:bg-gray-50 transition-colors"
                                        >
                                          <CheckSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                          <span className="flex-1 text-sm text-gray-700">
                                            {task.name}
                                          </span>
                                          <div className="flex gap-1">
                                            <button
                                              type="button"
                                              onClick={() => handleEditTask(task)}
                                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                              aria-label={`Edit ${task.name}`}
                                            >
                                              <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setDeleteTarget({
                                                  type: 'task',
                                                  id: task.id,
                                                  name: task.name,
                                                })
                                              }
                                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                              aria-label={`Delete ${task.name}`}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Client form modal */}
      <ClientForm
        isOpen={clientModalOpen}
        onClose={() => setClientModalOpen(false)}
        onSuccess={refreshAll}
        client={editClient}
      />

      {/* Project form modal */}
      <ProjectForm
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onSuccess={refreshAll}
        project={editProject}
        defaultClientId={addProjectClientId}
      />

      {/* Task form modal */}
      <TaskForm
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        onSuccess={refreshAll}
        task={editTask}
        defaultProjectId={addTaskProjectId}
      />

      {/* Delete confirmation dialog */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.type ? deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1) : ''}`}
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
          <span className="font-medium text-gray-900">{deleteTarget?.name}</span>?
          {deleteTarget?.type === 'client' && ' All projects and tasks under this client will also be deleted.'}
          {deleteTarget?.type === 'project' && ' All tasks under this project will also be deleted.'}
          {' '}This action cannot be undone.
        </p>
      </Modal>
    </>
  );
}
