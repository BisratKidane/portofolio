import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

function HarnessProbe() {
  return <h1>Frontend test harness is wired up</h1>;
}

describe('frontend test harness', () => {
  it('renders and queries an inline component by role/text', () => {
    render(<HarnessProbe />);

    expect(
      screen.getByRole('heading', { name: 'Frontend test harness is wired up' })
    ).toBeInTheDocument();
  });

  it('runs in a jsdom environment with matchMedia stubbed', () => {
    expect(typeof document).toBe('object');
    expect(typeof window.matchMedia).toBe('function');
    expect(() => window.matchMedia('(min-width: 600px)')).not.toThrow();
  });
});
