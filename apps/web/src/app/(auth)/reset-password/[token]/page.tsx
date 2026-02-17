'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import Link from 'next/link';
import Input from '@/../components/ui/input';
import Button from '@/../components/ui/button';
import { useToast } from '@/../components/ui/toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResetPasswordFormValues {
  password: string;
  confirmPassword: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const { control, handleSubmit, getValues } = useForm<ResetPasswordFormValues>({
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (data: ResetPasswordFormValues) => {
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: params.token,
          password: data.password,
        }),
      });

      const body = await res.json();

      if (!res.ok || !body.success) {
        showToast(body.error ?? 'Something went wrong.', 'error');
        return;
      }

      setSuccess(true);
      showToast('Password has been reset successfully.', 'success');
    } catch {
      showToast('Something went wrong. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Hour Tracker
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Set a new password
        </p>
      </div>

      {/* Card */}
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-8 shadow-sm">
        {success ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">
              Password reset
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              Your password has been reset successfully. You can now sign in
              with your new password.
            </p>
            <Button
              onClick={() => router.push('/login')}
              className="w-full"
            >
              Go to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {/* Password */}
            <Controller
              name="password"
              control={control}
              rules={{
                required: 'Password is required.',
                pattern: {
                  value: PASSWORD_PATTERN,
                  message: 'Min 8 characters, one uppercase letter, and one number.',
                },
              }}
              render={({ field, fieldState }) => (
                <Input
                  label="New password"
                  type="password"
                  placeholder="Enter your new password"
                  required
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  disabled={submitting}
                />
              )}
            />

            {/* Confirm password */}
            <Controller
              name="confirmPassword"
              control={control}
              rules={{
                required: 'Please confirm your password.',
                validate: (value) =>
                  value === getValues('password') || 'Passwords do not match.',
              }}
              render={({ field, fieldState }) => (
                <Input
                  label="Confirm new password"
                  type="password"
                  placeholder="Repeat your new password"
                  required
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  disabled={submitting}
                />
              )}
            />

            {/* Submit */}
            <Button
              type="submit"
              loading={submitting}
              className="w-full"
            >
              Reset password
            </Button>
          </form>
        )}
      </div>

      {/* Back to login */}
      <p className="mt-6 text-center text-sm text-gray-600">
        <Link
          href="/login"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
