'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import Link from 'next/link';
import Input from '@/../components/ui/input';
import Button from '@/../components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormValues {
  password: string;
  confirmPassword: string;
}

const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const { control, handleSubmit, getValues } = useForm<FormValues>({
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: params.token,
          password: data.password,
        }),
      });

      const body = await res.json();

      if (!res.ok || !body.success) {
        setError(body.error ?? 'Failed to set password.');
        return;
      }

      setSuccess(true);
      setUserEmail(body.data?.email ?? '');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Success state
  // -----------------------------------------------------------------------

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Hour Tracker
            </h1>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-6 py-8 shadow-sm text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Password Set</h2>
            <p className="mt-2 text-sm text-gray-600">
              Your account is ready. You can now sign in
              {userEmail ? ` as ${userEmail}` : ''}.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Form
  // -----------------------------------------------------------------------

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Hour Tracker
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Set your password to activate your account
          </p>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-8 shadow-sm">
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

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
                  label="Password"
                  type="password"
                  placeholder="Create a password"
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
                  label="Confirm password"
                  type="password"
                  placeholder="Repeat your password"
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
              Set Password
            </Button>
          </form>
        </div>

        {/* Login link */}
        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
