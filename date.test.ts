import { describe, it, expect } from 'vitest';

// A simple test case to verify Vitest works
describe('Date Utility Sandbox', () => {
  it('should properly format or calculate date values', () => {
    const date = new Date('2026-09-21');
    expect(date.getFullYear()).toBe(2026);
  });
});