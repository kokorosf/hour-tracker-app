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
  clientName: string;
}

interface PaginatedProjects {
  items: ProjectOption[];
  pagination: { total: number };
}

export interface TaskForForm {
  id: string;
  name: string;
  projectId: string;
}

interface TaskFormProps {
  isOpen: boolean;
  onClose: () => void;
  task: TaskForForm | null;
  onSuccess: () => void;
}

interface FormValues {
  name: string;
  projectId: string;
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TaskForm({ isOpen, onClose, task, onSuccess }: TaskFormProps) {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = task !== null;

  // Fetch projects for dropdown (only when modal is open).
  const { data: projectData } = useSWR<PaginatedProjects>(
    isOpen ? '/api/projects?pageSize=100' : null,
    fetcher,
  );
  const projects = projectData?.items ?? [];

  const {
    control,
    handleSubmit,
    reset,
    setError,
  } = useForm<FormValues>({
    defaultValues: { name: '', projectId: '' },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        name: task?.name ?? '',
        projectId: task?.projectId ?? '',
      });
    }
  }, [isOpen, task, reset]);

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);

    try {
      const payload = {
        name: data.name.trim(),
        projectId: data.projectId,
      };

      if (isEdit) {
        await api.put(`/api/tasks/${task.id}`, payload);
        showToast('Task updated.', 'success');
      } else {
        await api.post('/api/tasks', payload);
        showToast('Task created.', 'success');
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = (err as Error).message || 'Failed to save task.';
      setError('name', { message });
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Task' : 'Add Task'}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={handleSubmit(onSubmit)}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Name */}
        <Controller
          name="name"
          control={control}
          rules={{
            required: 'Name is required.',
            maxLength: { value: 255, message: 'Name must be 255 characters or fewer.' },
            validate: (v) => v.trim().length > 0 || 'Name is required.',
          }}
          render={({ field, fieldState }) => (
            <Input
              label="Name"
              value={field.value}
              onChange={field.onChange}
              placeholder="e.g. Design Review"
              required
              error={fieldState.error?.message}
              disabled={submitting}
            />
          )}
        />

        {/* Project select */}
        <Controller
          name="projectId"
          control={control}
          rules={{ required: 'Project is required.' }}
          render={({ field, fieldState }) => (
            <div>
              <label
                htmlFor="tf-project"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Project <span className="text-red-500 ml-0.5">*</span>
              </label>
              <select
                id="tf-project"
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                disabled={submitting}
                aria-invalid={fieldState.error ? true : undefined}
                className={[
                  'block w-full rounded-md border px-3 py-2 text-gray-900 shadow-sm text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-offset-0',
                  fieldState.error
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
                  submitting ? 'bg-gray-100 opacity-50 cursor-not-allowed' : 'bg-white',
                ].join(' ')}
              >
                <option value="">Select a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.clientName})
                  </option>
                ))}
              </select>
              {fieldState.error && (
                <p className="mt-1 text-sm text-red-600" role="alert">
                  {fieldState.error.message}
                </p>
              )}
            </div>
          )}
        />
      </form>
    </Modal>
  );
}
