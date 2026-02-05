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

interface LoginFormValues {
  email: string;
  password: string;
  remember: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '', remember: false },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setSubmitting(true);

    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        showToast('Invalid email or password.', 'error');
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
          Sign in to your account
        </p>
      </div>

      {/* Card */}
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-8 shadow-sm">
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

          {/* Password */}
          <Controller
            name="password"
            control={control}
            rules={{ required: 'Password is required.' }}
            render={({ field, fieldState }) => (
              <Input
                label="Password"
                type="password"
                placeholder="Enter your password"
                required
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
                disabled={submitting}
              />
            )}
          />

          {/* Remember me / Forgot password */}
          <div className="flex items-center justify-between">
            <Controller
              name="remember"
              control={control}
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Remember me
                </label>
              )}
            />

            <Link
              href="/forgot-password"
              className="text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              Forgot password?
            </Link>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            loading={submitting}
            className="w-full"
          >
            Sign in
          </Button>
        </form>
      </div>

      {/* Sign-up link */}
      <p className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
