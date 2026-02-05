'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import useSWR from 'swr';
import Modal from '@/../components/ui/modal';
import Input from '@/../components/ui/input';
import Button from '@/../components/ui/button';
import { useToast } from '@/../components/ui/toast';
import { api } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectOption {
  id: string;
  name: string;
}

interface TaskOption {
  id: string;
  name: string;
  projectId: string;
}

interface FormValues {
  projectId: string;
  taskId: string;
  startTime: string;
  endTime: string;
  description: string;
}

export interface TimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** If provided, edit this entry; otherwise create new. */
  entry?: {
    id: string;
    projectId: string;
    taskId: string;
    startTime: string;
    endTime: string;
    description?: string | null;
  };
  /** Pre-fill start/end when creating from a calendar slot. */
  defaultStart?: string;
  defaultEnd?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date or ISO string to `datetime-local` input value. */
function toLocalInput(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// SWR fetcher — uses our API client
// ---------------------------------------------------------------------------

interface PaginatedResponse<T> {
  items: T[];
  pagination: { total: number };
}

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TimeEntryModal({
  isOpen,
  onClose,
  onSaved,
  entry,
  defaultStart,
  defaultEnd,
}: TimeEntryModalProps) {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!entry;

  // Fetch projects and tasks for the select dropdowns.
  const { data: projectData } = useSWR<PaginatedResponse<ProjectOption>>(
    isOpen ? '/api/projects?pageSize=100' : null,
    fetcher,
  );
  const { data: taskData } = useSWR<PaginatedResponse<TaskOption>>(
    isOpen ? '/api/tasks?pageSize=100' : null,
    fetcher,
  );

  const projects = projectData?.items ?? [];
  const allTasks = taskData?.items ?? [];

  const { control, handleSubmit, watch, reset } = useForm<FormValues>({
    defaultValues: {
      projectId: '',
      taskId: '',
      startTime: '',
      endTime: '',
      description: '',
    },
  });

  const selectedProjectId = watch('projectId');
  const filteredTasks = allTasks.filter((t) => t.projectId === selectedProjectId);

  // Reset form when modal opens or entry changes.
  useEffect(() => {
    if (!isOpen) return;

    if (entry) {
      reset({
        projectId: entry.projectId,
        taskId: entry.taskId,
        startTime: toLocalInput(entry.startTime),
        endTime: toLocalInput(entry.endTime),
        description: entry.description ?? '',
      });
    } else {
      reset({
        projectId: '',
        taskId: '',
        startTime: defaultStart ? toLocalInput(defaultStart) : '',
        endTime: defaultEnd ? toLocalInput(defaultEnd) : '',
        description: '',
      });
    }
  }, [isOpen, entry, defaultStart, defaultEnd, reset]);

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);

    try {
      const payload = {
        projectId: data.projectId,
        taskId: data.taskId,
        startTime: new Date(data.startTime).toISOString(),
        endTime: new Date(data.endTime).toISOString(),
        description: data.description || undefined,
      };

      if (isEdit) {
        await api.put(`/api/time-entries/${entry!.id}`, payload);
        showToast('Time entry updated.', 'success');
      } else {
        await api.post('/api/time-entries', payload);
        showToast('Time entry created.', 'success');
      }

      onSaved();
      onClose();
    } catch (err) {
      showToast(
        (err as Error).message || 'Failed to save time entry.',
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Time Entry' : 'New Time Entry'}
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={submitting}
            onClick={handleSubmit(onSubmit)}
          >
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Project */}
        <Controller
          name="projectId"
          control={control}
          rules={{ required: 'Project is required.' }}
          render={({ field, fieldState }) => (
            <div>
              <label
                htmlFor="te-project"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Project <span className="text-red-500">*</span>
              </label>
              <select
                id="te-project"
                value={field.value}
                onChange={field.onChange}
                disabled={submitting}
                className={[
                  'block w-full rounded-md border px-3 py-2 text-gray-900 shadow-sm',
                  'focus:outline-none focus:ring-2 focus:ring-offset-0',
                  fieldState.error
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
                ].join(' ')}
              >
                <option value="">Select a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {fieldState.error && (
                <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />

        {/* Task */}
        <Controller
          name="taskId"
          control={control}
          rules={{ required: 'Task is required.' }}
          render={({ field, fieldState }) => (
            <div>
              <label
                htmlFor="te-task"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Task <span className="text-red-500">*</span>
              </label>
              <select
                id="te-task"
                value={field.value}
                onChange={field.onChange}
                disabled={submitting || !selectedProjectId}
                className={[
                  'block w-full rounded-md border px-3 py-2 text-gray-900 shadow-sm',
                  'focus:outline-none focus:ring-2 focus:ring-offset-0',
                  fieldState.error
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
                  !selectedProjectId ? 'bg-gray-100 opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <option value="">
                  {selectedProjectId ? 'Select a task' : 'Select a project first'}
                </option>
                {filteredTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {fieldState.error && (
                <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />

        {/* Start time */}
        <Controller
          name="startTime"
          control={control}
          rules={{ required: 'Start time is required.' }}
          render={({ field, fieldState }) => (
            <Input
              label="Start time"
              type="datetime-local"
              required
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
              disabled={submitting}
            />
          )}
        />

        {/* End time */}
        <Controller
          name="endTime"
          control={control}
          rules={{ required: 'End time is required.' }}
          render={({ field, fieldState }) => (
            <Input
              label="End time"
              type="datetime-local"
              required
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
              disabled={submitting}
            />
          )}
        />

        {/* Description */}
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <Input
              label="Description"
              type="text"
              placeholder="What did you work on?"
              value={field.value}
              onChange={field.onChange}
              disabled={submitting}
            />
          )}
        />
      </form>
    </Modal>
  );
}
