export type BinaryOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power';
export type UnaryOperation = 'sqrt' | 'percent';

export type CalculationRequest =
  | { operation: BinaryOperation; a: number; b: number }
  | { operation: UnaryOperation; a: number };

export const UNAVAILABLE = 'UNAVAILABLE';

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

interface ResultBody {
  result: number;
}

interface ErrorBody {
  error: { code: string; message: string };
}

function isResultBody(body: unknown): body is ResultBody {
  if (typeof body !== 'object' || body === null) return false;
  const { result } = body as Partial<ResultBody>;
  return typeof result === 'number' && Number.isFinite(result);
}

function isErrorBody(body: unknown): body is ErrorBody {
  if (typeof body !== 'object' || body === null) return false;
  const { error } = body as Partial<ErrorBody>;
  return typeof error?.code === 'string' && typeof error.message === 'string';
}

export async function calculate(request: CalculationRequest, signal?: AbortSignal): Promise<number> {
  const { operation, ...operands } = request;
  let response: Response;
  try {
    response = await fetch(`/api/v1/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operands),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(UNAVAILABLE, 'Service unavailable');
  }

  const body: unknown = await response.json().catch(() => null);
  if (response.ok && isResultBody(body)) return body.result;
  if (isErrorBody(body)) throw new ApiError(body.error.code, body.error.message);
  throw new ApiError(UNAVAILABLE, 'Service unavailable');
}
