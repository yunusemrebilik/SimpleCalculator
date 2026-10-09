import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_TIMEOUT_MS, useCalculator } from './useCalculator';

describe('request lifetime', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function setup() {
    const hook = renderHook(useCalculator);
    act(() => {
      hook.result.current.press({ type: 'digit', digit: '1' });
      hook.result.current.press({ type: 'operator', operator: 'add' });
      hook.result.current.press({ type: 'digit', digit: '2' });
      hook.result.current.press({ type: 'equals' });
    });
    return hook;
  }

  it('times out, preserves input, allows retry, and ignores the late response', async () => {
    let resolveLate!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveLate = resolve; }));
    const { result } = setup();
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(result.current.isLoading).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); });
    expect(signal?.aborted).toBe(true);
    expect(result.current).toMatchObject({
      isLoading: false, display: '1 + 2', error: 'Request timed out. Please try again.',
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: 3 })));
    await act(async () => { result.current.press({ type: 'equals' }); });
    expect(result.current).toMatchObject({ display: '1 + 2 = 3', error: null, isLoading: false });
    await act(async () => { resolveLate(new Response(JSON.stringify({ result: 999 }))); });
    expect(result.current.display).toBe('1 + 2 = 3');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts and removes the deadline when unmounted', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const { unmount } = setup();
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also times out when the response body stalls', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream()));
    const { result } = setup();
    await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toContain('timed out');
  });
});
