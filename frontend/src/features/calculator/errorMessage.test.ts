import { describe, expect, it } from 'vitest';
import { ApiError, UNAVAILABLE } from '../../api/calculatorApi';
import { toErrorMessage } from './errorMessage';

describe('toErrorMessage', () => {
  it.each([
    [new ApiError('DIVISION_BY_ZERO', 'division by zero is not allowed'), 'Cannot divide by zero'],
    [new ApiError('RESULT_OUT_OF_RANGE', 'result is out of range'), 'Result out of range'],
    [new ApiError(UNAVAILABLE, 'whatever'), 'Service unavailable'],
    [new ApiError('INVALID_NUMBER', 'operand "a" is out of range'), 'operand "a" is out of range'],
    [new Error('boom'), 'Service unavailable'],
    ['not an error', 'Service unavailable'],
  ])('%o -> %s', (error, expected) => {
    expect(toErrorMessage(error)).toBe(expected);
  });
});
