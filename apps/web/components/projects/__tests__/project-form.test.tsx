/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { api } from '@/lib/api/client';
import ProjectForm, { type ProjectForForm } from '../project-form';

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
  project: null as ProjectForForm | null,
  onSuccess: jest.fn(),
};

const editProject: ProjectForForm = {
  id: 'p1',
  name: 'Existing Project',
  clientId: 'c1',
  isBillable: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.post.mockResolvedValue({});
    mockApi.put.mockResolvedValue({});
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders "Add Project" title when project is null', () => {
    render(<ProjectForm {...defaultProps} project={null} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Add Project');
  });

  it('renders "Edit Project" title when project is provided', () => {
    render(<ProjectForm {...defaultProps} project={editProject} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Edit Project');
  });

  it('shows client dropdown options from SWR data', () => {
    render(<ProjectForm {...defaultProps} />);
    const select = screen.getByLabelText(/Client/);
    expect(select).toBeInTheDocument();

    // The select should contain the placeholder and the two mock clients
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(3); // "Select a client" + 2 clients
    expect(options[1]).toHaveTextContent('Client A');
    expect(options[2]).toHaveTextContent('Client B');
  });

  it('shows billable checkbox, checked by default in create mode', () => {
    render(<ProjectForm {...defaultProps} project={null} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('shows "Create" button in create mode', () => {
    render(<ProjectForm {...defaultProps} project={null} />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('shows "Save" button in edit mode', () => {
    render(<ProjectForm {...defaultProps} project={editProject} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('pre-fills fields in edit mode', () => {
    render(<ProjectForm {...defaultProps} project={editProject} />);

    const nameInput = screen.getByPlaceholderText('e.g. Website Redesign');
    expect(nameInput).toHaveValue('Existing Project');

    const clientSelect = screen.getByLabelText(/Client/) as HTMLSelectElement;
    expect(clientSelect.value).toBe('c1');

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('does not render when isOpen is false', () => {
    render(<ProjectForm {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // User interactions
  // -------------------------------------------------------------------------

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<ProjectForm {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it('shows validation error for empty name', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} project={null} />);

    // Select a client so validation only fails on name
    const clientSelect = screen.getByLabelText(/Client/);
    await user.selectOptions(clientSelect, 'c1');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Name is required.');
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('shows validation error when client is not selected', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} project={null} />);

    const nameInput = screen.getByPlaceholderText('e.g. Website Redesign');
    await user.type(nameInput, 'New Project');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Client is required.');
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Submit – create mode
  // -------------------------------------------------------------------------

  it('calls api.post on create with name, clientId, isBillable', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} project={null} />);

    const nameInput = screen.getByPlaceholderText('e.g. Website Redesign');
    await user.type(nameInput, '  New Project  ');

    const clientSelect = screen.getByLabelText(/Client/);
    await user.selectOptions(clientSelect, 'c2');

    // Billable is checked by default; uncheck it
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/projects', {
        name: 'New Project',
        clientId: 'c2',
        isBillable: false,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Submit – edit mode
  // -------------------------------------------------------------------------

  it('calls api.put on edit', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} project={editProject} />);

    const nameInput = screen.getByPlaceholderText('e.g. Website Redesign');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Project');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/api/projects/p1', {
        name: 'Updated Project',
        clientId: 'c1',
        isBillable: false,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Post-submit callbacks
  // -------------------------------------------------------------------------

  it('calls onSuccess and onClose after successful create', async () => {
    const user = userEvent.setup();
    const onSuccess = jest.fn();
    const onClose = jest.fn();
    render(<ProjectForm {...defaultProps} onSuccess={onSuccess} onClose={onClose} project={null} />);

    const nameInput = screen.getByPlaceholderText('e.g. Website Redesign');
    await user.type(nameInput, 'My Project');

    const clientSelect = screen.getByLabelText(/Client/);
    await user.selectOptions(clientSelect, 'c1');

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
    mockApi.post.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} project={null} />);

    const nameInput = screen.getByPlaceholderText('e.g. Website Redesign');
    await user.type(nameInput, 'Failing Project');

    const clientSelect = screen.getByLabelText(/Client/);
    await user.selectOptions(clientSelect, 'c1');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Network error', 'error');
    });
  });
});
