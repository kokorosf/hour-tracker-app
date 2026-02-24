/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import Input from '../input';

describe('Input', () => {
  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  it('renders a label linked to the input via htmlFor', () => {
    render(<Input label="Email" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Email');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('defaults to type="text"', () => {
    render(<Input label="Name" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('type', 'text');
  });

  it('accepts a custom type', () => {
    render(<Input label="Password" type="password" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('renders the placeholder text', () => {
    render(<Input label="Search" value="" onChange={() => {}} placeholder="Type here..." />);
    expect(screen.getByPlaceholderText('Type here...')).toBeInTheDocument();
  });

  it('renders the provided value', () => {
    render(<Input label="City" value="Tokyo" onChange={() => {}} />);
    expect(screen.getByLabelText('City')).toHaveValue('Tokyo');
  });

  // -----------------------------------------------------------------------
  // Required
  // -----------------------------------------------------------------------

  it('shows a red asterisk when required', () => {
    render(<Input label="Username" value="" onChange={() => {}} required />);
    const label = screen.getByText('Username').closest('label')!;
    const asterisk = label.querySelector('span');
    expect(asterisk).toBeInTheDocument();
    expect(asterisk).toHaveTextContent('*');
    expect(asterisk!.className).toContain('text-red-500');
  });

  it('does not show an asterisk when not required', () => {
    render(<Input label="Optional" value="" onChange={() => {}} />);
    const label = screen.getByText('Optional').closest('label')!;
    const asterisk = label.querySelector('span');
    expect(asterisk).not.toBeInTheDocument();
  });

  it('sets the required attribute on the input', () => {
    render(<Input label="Required field" value="" onChange={() => {}} required />);
    expect(screen.getByRole('textbox')).toBeRequired();
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  it('shows the error message with role="alert"', () => {
    render(<Input label="Email" value="" onChange={() => {}} error="Invalid email" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Invalid email');
  });

  it('sets aria-invalid when error is present', () => {
    render(<Input label="Email" value="" onChange={() => {}} error="Bad" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sets aria-describedby pointing to the error element', () => {
    render(<Input label="Email" value="" onChange={() => {}} error="Bad" />);
    const input = screen.getByLabelText('Email');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorEl = document.getElementById(describedBy!);
    expect(errorEl).toHaveTextContent('Bad');
  });

  it('does not set aria-invalid when no error', () => {
    render(<Input label="Email" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });

  it('does not render an alert element when no error', () => {
    render(<Input label="Email" value="" onChange={() => {}} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies error styling classes when error exists', () => {
    render(<Input label="Email" value="" onChange={() => {}} error="Bad" />);
    const input = screen.getByLabelText('Email');
    expect(input.className).toContain('border-red-500');
    expect(input.className).toContain('focus:ring-red-500');
  });

  it('applies normal border styling when no error', () => {
    render(<Input label="Email" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Email');
    expect(input.className).toContain('border-gray-300');
    expect(input.className).toContain('focus:ring-blue-500');
  });

  // -----------------------------------------------------------------------
  // Disabled state
  // -----------------------------------------------------------------------

  it('is disabled when disabled prop is true', () => {
    render(<Input label="Disabled" value="" onChange={() => {}} disabled />);
    expect(screen.getByLabelText('Disabled')).toBeDisabled();
  });

  it('applies disabled styling classes', () => {
    render(<Input label="Disabled" value="" onChange={() => {}} disabled />);
    const input = screen.getByLabelText('Disabled');
    expect(input.className).toContain('bg-gray-100');
    expect(input.className).toContain('opacity-50');
    expect(input.className).toContain('cursor-not-allowed');
  });

  it('applies normal background when not disabled', () => {
    render(<Input label="Enabled" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Enabled');
    expect(input.className).toContain('bg-white');
  });

  // -----------------------------------------------------------------------
  // onChange handler
  // -----------------------------------------------------------------------

  it('calls onChange with the string value (not the event)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Input label="Name" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText('Name'), 'A');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('A');
  });

  it('calls onChange for each character typed', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Input label="Name" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText('Name'), 'Hi');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, 'H');
    expect(onChange).toHaveBeenNthCalledWith(2, 'i');
  });

  // -----------------------------------------------------------------------
  // Custom className
  // -----------------------------------------------------------------------

  it('merges custom className on the wrapper div', () => {
    const { container } = render(
      <Input label="Styled" value="" onChange={() => {}} className="my-class" />
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain('my-class');
  });

  // -----------------------------------------------------------------------
  // Pass-through props
  // -----------------------------------------------------------------------

  it('passes through additional HTML attributes', () => {
    render(
      <Input label="Extra" value="" onChange={() => {}} data-testid="my-input" />
    );
    expect(screen.getByTestId('my-input')).toBeInTheDocument();
  });

  it('uses a custom id when provided', () => {
    render(<Input label="Custom ID" value="" onChange={() => {}} id="custom-id" />);
    const input = screen.getByLabelText('Custom ID');
    expect(input).toHaveAttribute('id', 'custom-id');
  });
});
