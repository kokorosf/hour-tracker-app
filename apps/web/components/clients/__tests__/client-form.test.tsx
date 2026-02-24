/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { api } from '@/lib/api/client';
import ClientForm from '../client-form';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/lib/api/client', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn((key: string | null) => {
    if (!key) return { data: undefined, error: undefined, isLoading: false };
    if (key.includes('/api/clients')) {
      return { data: { items: [{ id: 'c1', name: 'Client A' }, { id: 'c2', name: 'Client B' }], pagination: { total: 2 } }, error: undefined, isLoading: false };
    }
    if (key.includes('/api/projects')) {
      return { data: { items: [{ id: 'p1', name: 'Project X', clientName: 'Client A' }, { id: 'p2', name: 'Project Y', clientName: 'Client B' }], pagination: { total: 2 } }, error: undefined, isLoading: false };
    }
    return { data: undefined, error: undefined, isLoading: false };
  }),
  useSWRConfig: jest.fn(() => ({ mutate: jest.fn() })),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@headlessui/react', () => {
  return {
    Dialog: ({ children, className }: any) => <div role="dialog" className={className}>{children}</div>,
    DialogPanel: ({ children, className }: any) => <div className={className}>{children}</div>,
    DialogTitle: ({ children, className }: any) => <h2 className={className}>{children}</h2>,
    Transition: ({ show, children }: any) => show ? children : null,
    TransitionChild: ({ children }: any) => children,
  };
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockShowToast = jest.fn();
jest.mock('@/../components/ui/toast', () => ({
  useToast: () => ({ showToast: mockShowToast, dismissToast: jest.fn(), clearToasts: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockApi = api as jest.Mocked<typeof api>;

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  client: null as { id: string; name: string } | null,
  onSuccess: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClientForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.post.mockResolvedValue({});
    mockApi.put.mockResolvedValue({});
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders "Add Client" title when client is null', () => {
    render(<ClientForm {...defaultProps} client={null} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Add Client');
  });

  it('renders "Edit Client" title when client is provided', () => {
    render(<ClientForm {...defaultProps} client={{ id: '1', name: 'Acme' }} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Edit Client');
  });

  it('pre-fills name in edit mode', () => {
    render(<ClientForm {...defaultProps} client={{ id: '1', name: 'Acme' }} />);
    const input = screen.getByPlaceholderText('e.g. Acme Corp');
    expect(input).toHaveValue('Acme');
  });

  it('shows "Create" button in create mode', () => {
    render(<ClientForm {...defaultProps} client={null} />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('shows "Save" button in edit mode', () => {
    render(<ClientForm {...defaultProps} client={{ id: '1', name: 'Acme' }} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<ClientForm {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // User interactions
  // -------------------------------------------------------------------------

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<ClientForm {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it('shows validation error for empty name', async () => {
    const user = userEvent.setup();
    render(<ClientForm {...defaultProps} client={null} />);

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Name is required.');
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('shows validation error for whitespace-only name', async () => {
    const user = userEvent.setup();
    render(<ClientForm {...defaultProps} client={null} />);

    const input = screen.getByPlaceholderText('e.g. Acme Corp');
    await user.type(input, '   ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Name is required.');
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Submit – create mode
  // -------------------------------------------------------------------------

  it('calls api.post on create submit with trimmed name', async () => {
    const user = userEvent.setup();
    render(<ClientForm {...defaultProps} client={null} />);

    const input = screen.getByPlaceholderText('e.g. Acme Corp');
    await user.type(input, '  New Client  ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/clients', { name: 'New Client' });
    });
  });

  // -------------------------------------------------------------------------
  // Submit – edit mode
  // -------------------------------------------------------------------------

  it('calls api.put on edit submit', async () => {
    const user = userEvent.setup();
    render(<ClientForm {...defaultProps} client={{ id: 'abc', name: 'Old Name' }} />);

    const input = screen.getByPlaceholderText('e.g. Acme Corp');
    await user.clear(input);
    await user.type(input, 'Updated Name');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/api/clients/abc', { name: 'Updated Name' });
    });
  });

  // -------------------------------------------------------------------------
  // Post-submit callbacks
  // -------------------------------------------------------------------------

  it('calls onSuccess and onClose after successful save', async () => {
    const user = userEvent.setup();
    const onSuccess = jest.fn();
    const onClose = jest.fn();
    render(<ClientForm {...defaultProps} onSuccess={onSuccess} onClose={onClose} client={null} />);

    const input = screen.getByPlaceholderText('e.g. Acme Corp');
    await user.type(input, 'Test Client');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('shows error toast on API failure', async () => {
    mockApi.post.mockRejectedValue(new Error('Server error'));
    const user = userEvent.setup();
    render(<ClientForm {...defaultProps} client={null} />);

    const input = screen.getByPlaceholderText('e.g. Acme Corp');
    await user.type(input, 'Failing Client');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Server error', 'error');
    });
  });
});
