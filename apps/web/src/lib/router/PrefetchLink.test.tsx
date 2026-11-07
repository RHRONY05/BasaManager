import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PrefetchLink } from './PrefetchLink';

describe('PrefetchLink', () => {
  it('calls prefetch callback on pointerenter only once', () => {
    const prefetch = vi.fn();

    render(
      <MemoryRouter>
        <PrefetchLink to="/l/buildings" prefetch={prefetch}>
          Buildings
        </PrefetchLink>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Buildings' });
    expect(prefetch).not.toHaveBeenCalled();

    fireEvent.pointerEnter(link);
    expect(prefetch).toHaveBeenCalledTimes(1);

    // Second hover should not re-trigger prefetch
    fireEvent.pointerEnter(link);
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('calls prefetch callback on focus', () => {
    const prefetch = vi.fn();

    render(
      <MemoryRouter>
        <PrefetchLink to="/l/billing" prefetch={prefetch}>
          Billing
        </PrefetchLink>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Billing' });
    expect(prefetch).not.toHaveBeenCalled();

    fireEvent.focus(link);
    expect(prefetch).toHaveBeenCalledTimes(1);
  });
});
