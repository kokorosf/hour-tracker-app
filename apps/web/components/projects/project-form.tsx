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

interface ClientOption {
  id: string;
  name: string;
}

interface PaginatedClients {
  items: ClientOption[];
  pagination: { total: number };
}

export interface ProjectForForm {
  id: string;
  name: string;
  clientId: string;
  isBillable: boolean;
}

interface ProjectFormProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectForForm | null;
  onSuccess: () => void;
}

interface FormValues {
  name: string;
  clientId: string;
  isBillable: boolean;
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProjectForm({ isOpen, onClose, project, onSuccess }: ProjectFormProps) {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = project !== null;

  // Fetch clients for dropdown (only when modal is open).
  const { data: clientData } = useSWR<PaginatedClients>(
    isOpen ? '/api/clients?pageSize=100' : null,
    fetcher,
  );
  const clients = clientData?.items ?? [];

  const {
    control,
    handleSubmit,
    reset,
    setError,
  } = useForm<FormValues>({
    defaultValues: { name: '', clientId: '', isBillable: true },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        name: project?.name ?? '',
        clientId: project?.clientId ?? '',
        isBillable: project?.isBillable ?? true,
      });
    }
  }, [isOpen, project, reset]);

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);

    try {
      const payload = {
        name: data.name.trim(),
        clientId: data.clientId,
        isBillable: data.isBillable,
      };

      if (isEdit) {
        await api.put(`/api/projects/${project.id}`, payload);
        showToast('Project updated.', 'success');
      } else {
        await api.post('/api/projects', payload);
        showToast('Project created.', 'success');
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = (err as Error).message || 'Failed to save project.';
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
      title={isEdit ? 'Edit Project' : 'Add Project'}
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
              placeholder="e.g. Website Redesign"
              required
              error={fieldState.error?.message}
              disabled={submitting}
            />
          )}
        />

        {/* Client select */}
        <Controller
          name="clientId"
          control={control}
          rules={{ required: 'Client is required.' }}
          render={({ field, fieldState }) => (
            <div>
              <label
                htmlFor="pf-client"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Client <span className="text-red-500 ml-0.5">*</span>
              </label>
              <select
                id="pf-client"
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
                <option value="">Select a client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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

        {/* Billable checkbox */}
        <Controller
          name="isBillable"
          control={control}
          render={({ field }) => (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                disabled={submitting}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Billable
            </label>
          )}
        />
      </form>
    </Modal>
  );
}
