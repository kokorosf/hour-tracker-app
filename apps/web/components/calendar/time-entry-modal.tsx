'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import useSWR, { useSWRConfig } from 'swr';
import Modal from '@/../components/ui/modal';
import Input from '@/../components/ui/input';
import Button from '@/../components/ui/button';
import { useToast } from '@/../components/ui/toast';
import { api } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimeEntryForModal {
  id: string;
  projectId: string;
  taskId: string;
  startTime: string;
  endTime: string;
  description?: string | null;
}

export interface TimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** null → create mode, object → edit mode */
  entry: TimeEntryForModal | null;
  /** Pre-fill the date when creating from a calendar slot */
  initialDate?: Date;
  /** Called after a successful save so the parent can refresh data */
  onSaved?: () => void;
  /** Called after a successful delete so the parent can refresh data */
  onDeleted?: () => void;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface TaskOption {
  id: string;
  name: string;
  projectId: string;
}

interface PaginatedResponse<T> {
  items: T[];
  pagination: { total: number };
}

interface FormValues {
  projectId: string;
  taskId: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract YYYY-MM-DD from an ISO string or Date. */
function toDateStr(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Extract HH:MM from an ISO string or Date (local time). */
function toTimeStr(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/** Build an ISO string from separate date and time inputs. */
function combineDateAndTime(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

/** Format minutes as "Xh Ym". */
function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Select component (reusable within this modal)
// ---------------------------------------------------------------------------

function SelectField({
  id,
  label,
  required,
  value,
  onChange,
  disabled,
  error,
  placeholder,
  options,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className={[
          'block w-full rounded-md border px-3 py-2 text-gray-900 shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
          disabled ? 'bg-gray-100 opacity-50 cursor-not-allowed' : 'bg-white',
        ].join(' ')}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TimeEntryModal({
  isOpen,
  onClose,
  entry,
  initialDate,
  onSaved,
  onDeleted,
}: TimeEntryModalProps) {
  const { showToast } = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEdit = entry !== null;

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const { data: projectData } = useSWR<PaginatedResponse<ProjectOption>>(
    isOpen ? '/api/projects?pageSize=100' : null,
    fetcher,
  );

  const projects = projectData?.items ?? [];

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    getValues,
  } = useForm<FormValues>({
    defaultValues: {
      projectId: '',
      taskId: '',
      date: '',
      startTime: '',
      endTime: '',
      description: '',
    },
  });

  const selectedProjectId = watch('projectId');
  const watchedStartTime = watch('startTime');
  const watchedEndTime = watch('endTime');

  // Fetch tasks filtered by the selected project.
  const taskSwrKey =
    isOpen && selectedProjectId
      ? `/api/tasks?projectId=${selectedProjectId}&pageSize=100`
      : null;

  const { data: taskData } = useSWR<PaginatedResponse<TaskOption>>(
    taskSwrKey,
    fetcher,
  );

  const tasks = taskData?.items ?? [];

  // Clear taskId when project changes (unless we're resetting for an edit).
  const prevProjectRef = useMemo(() => ({ current: '' }), []);
  useEffect(() => {
    if (
      prevProjectRef.current &&
      prevProjectRef.current !== selectedProjectId
    ) {
      setValue('taskId', '');
    }
    prevProjectRef.current = selectedProjectId;
  }, [selectedProjectId, setValue, prevProjectRef]);

  // ---------------------------------------------------------------------------
  // Calculated duration
  // ---------------------------------------------------------------------------

  const durationDisplay = useMemo(() => {
    if (!watchedStartTime || !watchedEndTime) return '—';
    const [sh, sm] = watchedStartTime.split(':').map(Number);
    const [eh, em] = watchedEndTime.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    const diff = endMins - startMins;
    if (diff <= 0) return '—';
    return formatDuration(diff);
  }, [watchedStartTime, watchedEndTime]);

  // ---------------------------------------------------------------------------
  // Form reset when modal opens
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    if (entry) {
      reset({
        projectId: entry.projectId,
        taskId: entry.taskId,
        date: toDateStr(entry.startTime),
        startTime: toTimeStr(entry.startTime),
        endTime: toTimeStr(entry.endTime),
        description: entry.description ?? '',
      });
      prevProjectRef.current = entry.projectId;
    } else {
      const now = initialDate ?? new Date();
      reset({
        projectId: '',
        taskId: '',
        date: toDateStr(now),
        startTime: '',
        endTime: '',
        description: '',
      });
      prevProjectRef.current = '';
    }
  }, [isOpen, entry, initialDate, reset, prevProjectRef]);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);

    try {
      const payload = {
        projectId: data.projectId,
        taskId: data.taskId,
        startTime: combineDateAndTime(data.date, data.startTime),
        endTime: combineDateAndTime(data.date, data.endTime),
        description: data.description || undefined,
      };

      if (isEdit) {
        await api.put(`/api/time-entries/${entry!.id}`, payload);
        showToast('Time entry updated.', 'success');
      } else {
        await api.post('/api/time-entries', payload);
        showToast('Time entry created.', 'success');
      }

      // Revalidate any SWR key that starts with /api/time-entries.
      globalMutate(
        (key) => typeof key === 'string' && key.startsWith('/api/time-entries'),
        undefined,
        { revalidate: true },
      );

      onSaved?.();
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

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  const handleDelete = async () => {
    if (!entry) return;
    setDeleting(true);

    try {
      await api.delete(`/api/time-entries/${entry.id}`);
      showToast('Time entry deleted.', 'success');

      globalMutate(
        (key) => typeof key === 'string' && key.startsWith('/api/time-entries'),
        undefined,
        { revalidate: true },
      );

      onDeleted?.();
      onClose();
    } catch (err) {
      showToast(
        (err as Error).message || 'Failed to delete time entry.',
        'error',
      );
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  // Reset confirmation state when modal closes.
  useEffect(() => {
    if (!isOpen) setConfirmingDelete(false);
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Time Entry' : 'New Time Entry'}
      size="lg"
      footer={
        <div className="flex items-center gap-3">
          {/* Delete button — only in edit mode */}
          {isEdit && (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Delete this entry?</span>
                <Button
                  variant="danger"
                  size="sm"
                  loading={deleting}
                  onClick={handleDelete}
                >
                  Confirm
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setConfirmingDelete(false)}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                variant="danger"
                disabled={submitting}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
            )
          )}

          <div className="ml-auto flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={submitting || deleting}>
              Cancel
            </Button>
            <Button loading={submitting} disabled={deleting} onClick={handleSubmit(onSubmit)}>
              {isEdit ? 'Save Changes' : 'Create Entry'}
            </Button>
          </div>
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
            <SelectField
              id="te-project"
              label="Project"
              required
              value={field.value}
              onChange={field.onChange}
              disabled={submitting}
              error={fieldState.error?.message}
              placeholder="Select a project"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
        />

        {/* Task */}
        <Controller
          name="taskId"
          control={control}
          rules={{ required: 'Task is required.' }}
          render={({ field, fieldState }) => (
            <SelectField
              id="te-task"
              label="Task"
              required
              value={field.value}
              onChange={field.onChange}
              disabled={submitting || !selectedProjectId}
              error={fieldState.error?.message}
              placeholder={selectedProjectId ? 'Select a task' : 'Select a project first'}
              options={tasks.map((t) => ({ value: t.id, label: t.name }))}
            />
          )}
        />

        {/* Date */}
        <Controller
          name="date"
          control={control}
          rules={{ required: 'Date is required.' }}
          render={({ field, fieldState }) => (
            <Input
              label="Date"
              type="date"
              required
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
              disabled={submitting}
            />
          )}
        />

        {/* Start / End time + duration */}
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-2">
            <Controller
              name="startTime"
              control={control}
              rules={{ required: 'Start time is required.' }}
              render={({ field, fieldState }) => (
                <Input
                  label="Start time"
                  type="time"
                  required
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  disabled={submitting}
                />
              )}
            />
          </div>

          <div className="col-span-2">
            <Controller
              name="endTime"
              control={control}
              rules={{
                required: 'End time is required.',
                validate: (value) => {
                  const start = getValues('startTime');
                  if (!start || !value) return true;
                  return value > start || 'End time must be after start time.';
                },
              }}
              render={({ field, fieldState }) => (
                <Input
                  label="End time"
                  type="time"
                  required
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  disabled={submitting}
                />
              )}
            />
          </div>

          <div className="col-span-1 flex flex-col">
            <span className="block text-sm font-medium text-gray-700 mb-1">Duration</span>
            <div className="flex flex-1 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600">
              {durationDisplay}
            </div>
          </div>
        </div>

        {/* Description */}
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <div>
              <label
                htmlFor="te-description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Description
              </label>
              <textarea
                id="te-description"
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                disabled={submitting}
                rows={3}
                placeholder="What did you work on?"
                className={[
                  'block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm',
                  'placeholder:text-gray-400',
                  'focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500 focus:border-blue-500',
                  submitting ? 'bg-gray-100 opacity-50 cursor-not-allowed' : 'bg-white',
                ].join(' ')}
              />
            </div>
          )}
        />
      </form>
    </Modal>
  );
}
