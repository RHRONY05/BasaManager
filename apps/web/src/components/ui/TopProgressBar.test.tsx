import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import * as reactRouter from 'react-router';
import { TopProgressBar } from './TopProgressBar';

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof reactRouter>();
  return {
    ...actual,
    useNavigation: vi.fn(),
  };
});

describe('TopProgressBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is hidden when navigation is idle', () => {
    vi.mocked(reactRouter.useNavigation).mockReturnValue({
      state: 'idle',
      location: undefined,
      formAction: undefined,
      formData: undefined,
      formEncType: undefined,
      formMethod: undefined,
      json: undefined,
      text: undefined,
    });

    render(<TopProgressBar />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('becomes visible when navigation takes more than 150 ms', () => {
    const mockLocation: reactRouter.Location = {
      pathname: '/l/buildings',
      search: '',
      hash: '',
      state: null,
      key: 'test-key',
    };

    vi.mocked(reactRouter.useNavigation).mockReturnValue({
      state: 'loading',
      location: mockLocation,
      formAction: undefined,
      formData: undefined,
      formEncType: undefined,
      formMethod: undefined,
      json: undefined,
      text: undefined,
    });

    render(<TopProgressBar />);
    expect(screen.queryByRole('progressbar')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(160);
    });

    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-label', 'Loading page');
  });
});
