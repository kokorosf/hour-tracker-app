'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import Input from '@/../components/ui/input';
import Button from '@/../components/ui/button';
import { useToast } from '@/../components/ui/toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegisterFormValues {
  email: string;
  password: string;
  confirmPassword: string;
  tenantName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit, getValues } = useForm<RegisterFormValues>({
    defaultValues: { email: '', password: '', confirmPassword: '', tenantName: '' },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setSubmitting(true);

    try {
      // Call register API directly (non-standard response shape).
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          tenantName: data.tenantName,
        }),
      });

      const body = await res.json();

      if (!res.ok || !body.success) {
        showToast(body.error ?? 'Registration failed.', 'error');
        return;
      }

      // Store token for the API client.
      if (body.token) {
        localStorage.setItem('token', body.token);
      }

      // Sign in via NextAuth so the session is established.
      const signInResult = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (signInResult?.error) {
        // Account was created but session failed — redirect to login.
        showToast('Account created. Please sign in.', 'info');
        router.push('/login');
        return;
      }

      router.push('/dashboard');
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
          Create your account
        </p>
      </div>

      {/* Card */}
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-8 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {/* Tenant / Company name */}
          <Controller
            name="tenantName"
            control={control}
            rules={{ required: 'Company name is required.' }}
            render={({ field, fieldState }) => (
              <Input
                label="Company name"
                type="text"
                placeholder="Acme Inc."
                required
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
                disabled={submitting}
              />
            )}
          />

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
            Create account
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
  );
}
