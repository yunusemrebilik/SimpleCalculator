import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculate, UNAVAILABLE } from './calculatorApi';

function mockFetch(implementation: () => Promise<Response>) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

describe('calculate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts operands to the operation endpoint and returns the result', async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, { result: 5 }));

    await expect(calculate({ operation: 'add', a: 2, b: 3 })).resolves.toBe(5);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 2, b: 3 }),
      signal: undefined,
    });
  });

  it('posts only the single operand of a unary operation', async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, { result: 3 }));

    await expect(calculate({ operation: 'sqrt', a: 9 })).resolves.toBe(3);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/sqrt', expect.objectContaining({ body: JSON.stringify({ a: 9 }) }));
  });

  it('throws an ApiError with the code and message from an error response', async () => {
    mockFetch(() =>
      jsonResponse(422, { error: { code: 'DIVISION_BY_ZERO', message: 'division by zero is not allowed' } }),
    );

    await expect(calculate({ operation: 'divide', a: 1, b: 0 })).rejects.toMatchObject({
      name: 'ApiError',
      code: 'DIVISION_BY_ZERO',
      message: 'division by zero is not allowed',
    });
  });

  it('throws UNAVAILABLE when the network request fails', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    await expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toMatchObject({ code: UNAVAILABLE });
  });

  it('throws UNAVAILABLE when the response is not JSON', async () => {
    mockFetch(() => Promise.resolve(new Response('<html>Bad Gateway</html>', { status: 502 })));

    await expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toMatchObject({ code: UNAVAILABLE });
  });

  it('throws UNAVAILABLE when a success response has an unexpected shape', async () => {
    mockFetch(() => jsonResponse(200, { value: 3 }));

    await expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toMatchObject({ code: UNAVAILABLE });
  });

  it('rethrows the abort error when the request is aborted', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('Aborted', 'AbortError');
    mockFetch(() => {
      controller.abort();
      return Promise.reject(abortError);
    });

    await expect(calculate({ operation: 'add', a: 1, b: 2 }, controller.signal)).rejects.toBe(abortError);
  });
});
