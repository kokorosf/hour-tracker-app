'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global error boundary]', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-slate-50">
        <div className="flex min-h-screen flex-col items-center justify-center px-4">
          <div className="text-center">
            <p className="text-7xl font-bold text-red-600">500</p>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-900">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              A critical error occurred. Please try again.
            </p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                onClick={reset}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Try again
              </button>
              <a
                href="/"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
