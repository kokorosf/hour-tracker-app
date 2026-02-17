'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import Link from 'next/link';
import Input from '@/../components/ui/input';
import Button from '@/../components/ui/button';
import { useToast } from '@/../components/ui/toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ForgotPasswordFormValues {
  email: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ForgotPasswordPage() {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { control, handleSubmit } = useForm<ForgotPasswordFormValues>({
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });

      const body = await res.json();

      if (!res.ok && res.status !== 429) {
        showToast(body.error ?? 'Something went wrong.', 'error');
        return;
      }

      if (res.status === 429) {
        showToast('Too many requests. Please try again later.', 'error');
        return;
      }

      setSubmitted(true);
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
          Reset your password
        </p>
      </div>

      {/* Card */}
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-8 shadow-sm">
        {submitted ? (
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
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">
              Check your email
            </h2>
            <p className="text-sm text-gray-600">
              If an account with that email exists, we&apos;ve sent a password
              reset link. Please check your inbox and spam folder.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-5 text-sm text-gray-600">
              Enter your email address and we&apos;ll send you a link to reset
              your password.
            </p>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              {/* Email */}
              <Controller
                name="email"
                control={control}
                rules={{
                  required: 'Email is required.',
                  pattern: {
                    value: EMAIL_PATTERN,
                    message: 'Enter a valid email address.',
                  },
                }}
                render={({ field, fieldState }) => (
                  <Input
                    label="Email"
                    type="email"
                    placeholder="you@company.com"
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
                Send reset link
              </Button>
            </form>
          </>
        )}
      </div>

      {/* Back to login */}
      <p className="mt-6 text-center text-sm text-gray-600">
        Remember your password?{' '}
        <Link
          href="/login"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
