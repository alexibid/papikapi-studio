import { LoaderProgress } from './loader-progress';

describe('LoaderProgress', () => {
  it('should grow linearly up to ninety percent at the expected time', () => {
    expect(LoaderProgress.percentAt(0, 20)).toBe(0);
    expect(LoaderProgress.percentAt(10, 20)).toBe(45);
    expect(LoaderProgress.percentAt(20, 20)).toBe(90);
  });

  it('should keep moving after the expected time without reaching one hundred', () => {
    const late = LoaderProgress.percentAt(40, 20);
    const later = LoaderProgress.percentAt(60, 20);
    expect(late).toBeGreaterThan(90);
    expect(later).toBeGreaterThan(late);
    expect(LoaderProgress.percentAt(10_000, 20)).toBeLessThan(100);
  });

  it('should place each step inside its share of the whole process', () => {
    const start = { stepIndex: 1, stepCount: 4, expectedSeconds: 10, elapsedSeconds: 0 };
    expect(LoaderProgress.percentAcrossSteps(start)).toBe(25);
    expect(LoaderProgress.percentAcrossSteps({ ...start, elapsedSeconds: 10 })).toBeCloseTo(47.5);
  });

  it('should show decimals only once the process passes ninety percent', () => {
    expect(LoaderProgress.format(42.7)).toBe('42%');
    expect(LoaderProgress.format(96.38)).toBe('96.3%');
  });
});
