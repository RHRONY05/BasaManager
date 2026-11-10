import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import LandingPage from './LandingPage';

// LandingPage renders TopProgressBar, which reads the data router's navigation state.
const renderLanding = () =>
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <LandingPage /> }], { initialEntries: ['/'] })}
    />,
  );

/** The bill is rendered twice (beside the building on wide screens, below it on narrow ones); both must agree. */
const billRegions = () => {
  const regions = document.querySelectorAll<HTMLElement>('[aria-live="polite"]');
  expect(regions.length).toBe(2);
  return [...regions];
};

describe('LandingPage building cut-away', () => {
  it('starts with flat 4A selected and shows its bill', () => {
    renderLanding();

    expect(screen.getByRole('button', { name: 'Flat 4A, Due' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Flat 6A, Paid' })).toHaveAttribute('aria-pressed', 'false');
    for (const region of billRegions()) {
      expect(within(region).getByText('November 2026 · Flat 4A')).toBeInTheDocument();
      expect(within(region).getByText('Pay ৳16,475 now')).toBeInTheDocument();
    }
  });

  it('selecting another flat presses it and swaps the bill', () => {
    renderLanding();

    fireEvent.click(screen.getByRole('button', { name: 'Flat 3A, Repair' }));

    expect(screen.getByRole('button', { name: 'Flat 3A, Repair' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Flat 4A, Due' })).toHaveAttribute('aria-pressed', 'false');
    for (const region of billRegions()) {
      expect(within(region).getByText('November 2026 · Flat 3A')).toBeInTheDocument();
      expect(within(region).getByText('Kitchen tap leaking · caretaker on the way')).toBeInTheDocument();
      expect(within(region).queryByText(/^Pay /)).not.toBeInTheDocument();
    }
  });

  it('a vacant flat shows no bill', () => {
    renderLanding();

    fireEvent.click(screen.getByRole('button', { name: 'Flat 5B, Vacant' }));

    for (const region of billRegions()) {
      expect(within(region).getByText('Vacant · no bill this month')).toBeInTheDocument();
      expect(within(region).queryByText('Total')).not.toBeInTheDocument();
    }
  });

  it('keeps the sign-up and sign-in links', () => {
    renderLanding();

    const signup = screen.getAllByRole('link', { name: /create landlord account/i });
    const signin = screen.getAllByRole('link', { name: /^sign in$/i });
    expect(signup.length).toBeGreaterThan(0);
    expect(signin.length).toBeGreaterThan(0);
    signup.forEach((a) => expect(a).toHaveAttribute('href', '/signup'));
    signin.forEach((a) => expect(a).toHaveAttribute('href', '/login'));
  });
});
