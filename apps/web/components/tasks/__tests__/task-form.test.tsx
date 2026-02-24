/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { api } from '@/lib/api/client';
import TaskForm, { type TaskForForm } from '../task-form';

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
  task: null as TaskForForm | null,
  onSuccess: jest.fn(),
};

const editTask: TaskForForm = {
  id: 't1',
  name: 'Existing Task',
  projectId: 'p1',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.post.mockResolvedValue({});
    mockApi.put.mockResolvedValue({});
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders "Add Task" title when task is null', () => {
    render(<TaskForm {...defaultProps} task={null} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Add Task');
  });

  it('renders "Edit Task" title when task is provided', () => {
    render(<TaskForm {...defaultProps} task={editTask} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Edit Task');
  });

  it('shows project dropdown options from SWR data', () => {
    render(<TaskForm {...defaultProps} />);
    const select = screen.getByLabelText(/Project/);
    expect(select).toBeInTheDocument();

    // The select should contain the placeholder and the two mock projects
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(3); // "Select a project" + 2 projects
    expect(options[1]).toHaveTextContent('Project X (Client A)');
    expect(options[2]).toHaveTextContent('Project Y (Client B)');
  });

  it('shows "Create" button in create mode', () => {
    render(<TaskForm {...defaultProps} task={null} />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('shows "Save" button in edit mode', () => {
    render(<TaskForm {...defaultProps} task={editTask} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('pre-fills fields in edit mode', () => {
    render(<TaskForm {...defaultProps} task={editTask} />);

    const nameInput = screen.getByPlaceholderText('e.g. Design Review');
    expect(nameInput).toHaveValue('Existing Task');

    const projectSelect = screen.getByLabelText(/Project/) as HTMLSelectElement;
    expect(projectSelect.value).toBe('p1');
  });

  it('does not render when isOpen is false', () => {
    render(<TaskForm {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // User interactions
  // -------------------------------------------------------------------------

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<TaskForm {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it('shows validation error for empty name', async () => {
    const user = userEvent.setup();
    render(<TaskForm {...defaultProps} task={null} />);

    // Select a project so validation only fails on name
    const projectSelect = screen.getByLabelText(/Project/);
    await user.selectOptions(projectSelect, 'p1');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Name is required.');
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('shows validation error when project is not selected', async () => {
    const user = userEvent.setup();
    render(<TaskForm {...defaultProps} task={null} />);

    const nameInput = screen.getByPlaceholderText('e.g. Design Review');
    await user.type(nameInput, 'New Task');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Project is required.');
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Submit – create mode
  // -------------------------------------------------------------------------

  it('calls api.post on create with name, projectId', async () => {
    const user = userEvent.setup();
    render(<TaskForm {...defaultProps} task={null} />);

    const nameInput = screen.getByPlaceholderText('e.g. Design Review');
    await user.type(nameInput, '  New Task  ');

    const projectSelect = screen.getByLabelText(/Project/);
    await user.selectOptions(projectSelect, 'p2');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/tasks', {
        name: 'New Task',
        projectId: 'p2',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Submit – edit mode
  // -------------------------------------------------------------------------

  it('calls api.put on edit', async () => {
    const user = userEvent.setup();
    render(<TaskForm {...defaultProps} task={editTask} />);

    const nameInput = screen.getByPlaceholderText('e.g. Design Review');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Task');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/api/tasks/t1', {
        name: 'Updated Task',
        projectId: 'p1',
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
    render(<TaskForm {...defaultProps} onSuccess={onSuccess} onClose={onClose} task={null} />);

    const nameInput = screen.getByPlaceholderText('e.g. Design Review');
    await user.type(nameInput, 'My Task');

    const projectSelect = screen.getByLabelText(/Project/);
    await user.selectOptions(projectSelect, 'p1');

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
    render(<TaskForm {...defaultProps} task={null} />);

    const nameInput = screen.getByPlaceholderText('e.g. Design Review');
    await user.type(nameInput, 'Failing Task');

    const projectSelect = screen.getByLabelText(/Project/);
    await user.selectOptions(projectSelect, 'p1');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Server error', 'error');
    });
  });
});
