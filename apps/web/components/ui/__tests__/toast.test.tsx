/** @jest-environment jsdom */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ToastProvider, useToast } from '../toast';

// ---------------------------------------------------------------------------
// Helper component -- gives test code access to the toast context via a
// callback prop.
// ---------------------------------------------------------------------------

function TestConsumer({ action }: { action?: (ctx: ReturnType<typeof useToast>) => void }) {
  const ctx = useToast();
  return <button onClick={() => action?.(ctx)}>trigger</button>;
}

describe('Toast', () => {
  // Ensure real timers are always restored after each test.
  afterEach(() => {
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // useToast outside provider
  // -----------------------------------------------------------------------

  it('throws when useToast is used outside of ToastProvider', () => {
    // Suppress the expected React error boundary console noise.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(
      'useToast must be used within a <ToastProvider>.'
    );

    spy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // showToast
  // -----------------------------------------------------------------------

  it('showToast adds a toast with role="alert"', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer action={(ctx) => ctx.showToast('Hello')} />
      </ToastProvider>
    );

    await user.click(screen.getByRole('button', { name: 'trigger' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('toast message text is visible', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer action={(ctx) => ctx.showToast('Success!')} />
      </ToastProvider>
    );

    await user.click(screen.getByRole('button', { name: 'trigger' }));
    expect(screen.getByText('Success!')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Multiple toasts
  // -----------------------------------------------------------------------

  it('multiple toasts can be shown at once', async () => {
    const user = userEvent.setup();
    let callCount = 0;
    const messages = ['First', 'Second', 'Third'];

    render(
      <ToastProvider>
        <TestConsumer
          action={(ctx) => {
            ctx.showToast(messages[callCount]!);
            callCount++;
          }}
        />
      </ToastProvider>
    );

    const trigger = screen.getByRole('button', { name: 'trigger' });
    await user.click(trigger);
    await user.click(trigger);
    await user.click(trigger);

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(3);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // dismissToast
  // -----------------------------------------------------------------------

  it('dismissToast removes a toast', async () => {
    jest.useFakeTimers();
    // Tell userEvent to advance fake timers so clicks do not hang.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <ToastProvider>
        <TestConsumer action={(ctx) => ctx.showToast('Remove me')} />
      </ToastProvider>
    );

    // Show a toast
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    expect(screen.getByText('Remove me')).toBeInTheDocument();

    // Click the built-in Dismiss button on the toast
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
    await user.click(dismissBtn);

    // Advance timers past the 200ms exit-animation delay
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.queryByText('Remove me')).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // clearToasts
  // -----------------------------------------------------------------------

  it('clearToasts removes all toasts', async () => {
    const user = userEvent.setup();
    let phase: 'add' | 'clear' = 'add';

    render(
      <ToastProvider>
        <TestConsumer
          action={(ctx) => {
            if (phase === 'add') {
              ctx.showToast('Toast A');
              ctx.showToast('Toast B');
              phase = 'clear';
            } else {
              ctx.clearToasts();
            }
          }}
        />
      </ToastProvider>
    );

    const trigger = screen.getByRole('button', { name: 'trigger' });

    // Add toasts
    await user.click(trigger);
    expect(screen.getAllByRole('alert')).toHaveLength(2);

    // Clear all
    await user.click(trigger);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Toast type styling
  // -----------------------------------------------------------------------

  it('applies success styling for success type', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer action={(ctx) => ctx.showToast('Done', 'success')} />
      </ToastProvider>
    );

    await user.click(screen.getByRole('button', { name: 'trigger' }));
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-green-600');
  });

  it('applies error styling for error type', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer action={(ctx) => ctx.showToast('Oops', 'error')} />
      </ToastProvider>
    );

    await user.click(screen.getByRole('button', { name: 'trigger' }));
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-red-600');
  });

  it('defaults to info type', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer action={(ctx) => ctx.showToast('FYI')} />
      </ToastProvider>
    );

    await user.click(screen.getByRole('button', { name: 'trigger' }));
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-blue-600');
  });
});
