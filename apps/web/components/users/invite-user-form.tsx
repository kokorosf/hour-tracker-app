'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import Modal from '@/../components/ui/modal';
import Input from '@/../components/ui/input';
import Button from '@/../components/ui/button';
import { useToast } from '@/../components/ui/toast';
import { api } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InviteUserFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormValues {
  email: string;
  role: 'admin' | 'user';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InviteUserForm({ isOpen, onClose, onSuccess }: InviteUserFormProps) {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setError,
  } = useForm<FormValues>({
    defaultValues: { email: '', role: 'user' },
  });

  useEffect(() => {
    if (isOpen) {
      reset({ email: '', role: 'user' });
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);

    try {
      await api.post('/api/users', {
        email: data.email.trim().toLowerCase(),
        role: data.role,
      });
      showToast('Invitation sent successfully.', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      const message = (err as Error).message || 'Failed to invite user.';
      setError('email', { message });
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite User"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={handleSubmit(onSubmit)}>
            Send Invite
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Email */}
        <Controller
          name="email"
          control={control}
          rules={{
            required: 'Email is required.',
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: 'Enter a valid email address.',
            },
          }}
          render={({ field, fieldState }) => (
            <Input
              label="Email"
              type="email"
              value={field.value}
              onChange={field.onChange}
              placeholder="colleague@example.com"
              required
              error={fieldState.error?.message}
              disabled={submitting}
            />
          )}
        />

        {/* Role selector */}
        <Controller
          name="role"
          control={control}
          rules={{ required: 'Role is required.' }}
          render={({ field, fieldState }) => (
            <div>
              <label
                htmlFor="iu-role"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Role <span className="text-red-500 ml-0.5">*</span>
              </label>
              <select
                id="iu-role"
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
                <option value="user">User</option>
                <option value="admin">Admin</option>
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
