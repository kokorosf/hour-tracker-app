'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import Modal from '@/../components/ui/modal';
import Input from '@/../components/ui/input';
import Button from '@/../components/ui/button';
import { useToast } from '@/../components/ui/toast';
import { api } from '@/lib/api/client';
import type { Client } from '@hour-tracker/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientFormProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  onSuccess: () => void;
}

interface FormValues {
  name: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClientForm({ isOpen, onClose, client, onSuccess }: ClientFormProps) {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = client !== null;

  const {
    control,
    handleSubmit,
    reset,
    setError,
  } = useForm<FormValues>({
    defaultValues: { name: '' },
  });

  // Reset form whenever the modal opens or the client changes.
  useEffect(() => {
    if (isOpen) {
      reset({ name: client?.name ?? '' });
    }
  }, [isOpen, client, reset]);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);

    try {
      if (isEdit) {
        await api.put(`/api/clients/${client.id}`, { name: data.name.trim() });
        showToast('Client updated.', 'success');
      } else {
        await api.post('/api/clients', { name: data.name.trim() });
        showToast('Client created.', 'success');
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = (err as Error).message || 'Failed to save client.';
      setError('name', { message });
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Client' : 'Add Client'}
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
        <Controller
          name="name"
          control={control}
          rules={{
            required: 'Name is required.',
            minLength: { value: 1, message: 'Name is required.' },
            maxLength: { value: 255, message: 'Name must be 255 characters or fewer.' },
            validate: (v) => v.trim().length > 0 || 'Name is required.',
          }}
          render={({ field, fieldState }) => (
            <Input
              label="Name"
              value={field.value}
              onChange={field.onChange}
              placeholder="e.g. Acme Corp"
              required
              error={fieldState.error?.message}
              disabled={submitting}
            />
          )}
        />
      </form>
    </Modal>
  );
}
