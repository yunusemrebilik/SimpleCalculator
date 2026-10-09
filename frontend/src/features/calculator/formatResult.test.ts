import { describe, expect, it } from 'vitest';
import { formatResult, resultToOperand } from './formatResult';

describe('formatResult', () => {
  it.each([
    [3.5, '3.5'],
    [3.5000001, '3.5000001'],
    [1 / 3, '0.333333333333'],
    [2 / 3, '0.666666666667'],
    [0.1 + 0.2, '0.3'],
    [-42, '-42'],
    [0, '0'],
    [-0, '0'],
    [-0.000001, '-0.000001'],
    [123456789012, '123456789012'],
    [1e21, '1000000000000000000000'],
  ])('%d -> %s', (value, expected) => {
    expect(formatResult(value)).toBe(expected);
  });
});

describe('resultToOperand', () => {
  it.each([1 / 3, 0.1 + 0.2, 1e-7, -1e-20, 1e21, Number.MAX_VALUE, Number.MIN_VALUE])(
    'preserves %s through an editable decimal string', (value) => {
      const operand = resultToOperand(value);
      expect(operand).toMatch(/^-?\d+(\.\d+)?$/);
      expect(Number(operand)).toBe(value);
    },
  );

  it('does not format a subnormal value as zero', () => {
    expect(Number(formatResult(Number.MIN_VALUE))).toBe(Number.MIN_VALUE);
  });
});
