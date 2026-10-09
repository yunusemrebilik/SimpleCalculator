import { ApiError, UNAVAILABLE } from '../../api/calculatorApi';

const SERVICE_UNAVAILABLE = 'Service unavailable';

const MESSAGES_BY_CODE: Record<string, string> = {
  DIVISION_BY_ZERO: 'Cannot divide by zero',
  NEGATIVE_SQRT: 'Cannot take the square root of a negative number',
  UNDEFINED_RESULT: 'Result is undefined',
  RESULT_OUT_OF_RANGE: 'Result out of range',
  [UNAVAILABLE]: SERVICE_UNAVAILABLE,
};

export function toErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return SERVICE_UNAVAILABLE;
  return MESSAGES_BY_CODE[error.code] ?? error.message;
}
