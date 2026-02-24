/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import Modal from '../modal';

// ---------------------------------------------------------------------------
// Mock @headlessui/react so we can test in jsdom without the full headless-ui
// runtime.  Transition gates rendering on `show`, everything else just renders
// its children.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@headlessui/react', () => {
  return {
    Dialog: ({ children, onClose, className }: any) => (
      <div role="dialog" className={className} data-onclose={onClose ? 'true' : 'false'}>
        {children}
      </div>
    ),
    DialogPanel: ({ children, className }: any) => <div className={className}>{children}</div>,
    DialogTitle: ({ children, className }: any) => <h2 className={className}>{children}</h2>,
    Transition: ({ show, children }: any) => (show ? children : null),
    TransitionChild: ({ children }: any) => children,
  };
});
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    title: 'Test Modal',
    children: <p>Modal body</p>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Open / closed
  // -----------------------------------------------------------------------

  it('renders title and children when isOpen is true', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal body')).toBeInTheDocument();
  });

  it('does not render content when isOpen is false', () => {
    render(<Modal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    expect(screen.queryByText('Modal body')).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Footer
  // -----------------------------------------------------------------------

  it('renders footer when provided', () => {
    render(
      <Modal {...defaultProps} footer={<button>Save</button>} />
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does not render the footer section when footer is not provided', () => {
    const { container } = render(<Modal {...defaultProps} />);
    // The footer wrapper has a border-t class; ensure it is absent
    const footerDiv = container.querySelector('.border-t.border-gray-200.px-6.py-4');
    expect(footerDiv).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Close button
  // -----------------------------------------------------------------------

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Sizes
  // -----------------------------------------------------------------------

  it('applies the default md size class', () => {
    const { container } = render(<Modal {...defaultProps} />);
    const panel = container.querySelector('.max-w-md');
    expect(panel).toBeInTheDocument();
  });

  it('applies sm size class', () => {
    const { container } = render(<Modal {...defaultProps} size="sm" />);
    const panel = container.querySelector('.max-w-sm');
    expect(panel).toBeInTheDocument();
  });

  it('applies lg size class', () => {
    const { container } = render(<Modal {...defaultProps} size="lg" />);
    const panel = container.querySelector('.max-w-lg');
    expect(panel).toBeInTheDocument();
  });

  it('applies xl size class', () => {
    const { container } = render(<Modal {...defaultProps} size="xl" />);
    const panel = container.querySelector('.max-w-xl');
    expect(panel).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Dialog role
  // -----------------------------------------------------------------------

  it('renders with role="dialog"', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Title element
  // -----------------------------------------------------------------------

  it('renders the title as an h2 heading', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Test Modal');
  });
});
