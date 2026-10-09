import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Calculator } from './Calculator';

const fetchMock = vi.fn<typeof fetch>();

function respondWith(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function setup() {
  const user = userEvent.setup();
  render(<Calculator />);
  const display = screen.getByRole('status', { name: 'Display' });
  const click = async (...names: string[]) => {
    for (const name of names) await user.click(screen.getByRole('button', { name }));
  };
  return { user, display, click };
}

describe('Calculator', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('shows 0 initially', () => {
    const { display } = setup();
    expect(display).toHaveTextContent('0');
  });

  it('activates focused buttons with Enter and Space, while equals remains a shortcut', async () => {
    respondWith(200, { result: 14 });
    const { user, display } = setup();
    for (let i = 0; i < 8; i++) await user.tab(); // AC ± ⌫ √ xʸ % ÷ 7
    expect(screen.getByRole('button', { name: '7' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(display).toHaveTextContent(/^7$/);
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    await user.keyboard('+ '); // Space activates the focused 7 button.
    expect(display).toHaveTextContent('7 + 7');
    await user.keyboard('=');
    await screen.findByText('7 + 7 = 14');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps small results nonzero when chaining', async () => {
    respondWith(200, { result: 0.000001 });
    respondWith(200, { result: 1 });
    const { user } = setup();
    await user.keyboard('1/1000000{Enter}');
    await screen.findByText('1 ÷ 1000000 = 0.000001');
    await user.keyboard('*1000000{Enter}');
    await screen.findByText('0.000001 × 1000000 = 1');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/multiply',
      expect.objectContaining({ body: JSON.stringify({ a: 0.000001, b: 1000000 }) }));
  });

  it('calculates with button clicks', async () => {
    respondWith(200, { result: 36 });
    const { display, click } = setup();

    await click('1', '2', 'Multiply', '3', 'Equals');

    expect(await screen.findByText('12 × 3 = 36')).toBe(display);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/multiply',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ a: 12, b: 3 }) }),
    );
  });

  it('calculates with the keyboard', async () => {
    respondWith(200, { result: 3.3333333333 });
    const { user, display } = setup();

    await user.keyboard('10/3{Enter}');

    expect(await screen.findByText('10 ÷ 3 = 3.3333333333')).toBe(display);
  });

  it('supports negative operands via minus and the sign toggle', async () => {
    respondWith(200, { result: 15 });
    const { user, display, click } = setup();

    await user.keyboard('12--');
    await click('3', 'Toggle sign', 'Toggle sign');
    expect(display).toHaveTextContent('12 − -3');

    await click('Equals');
    expect(await screen.findByText('12 − -3 = 15')).toBe(display);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/subtract',
      expect.objectContaining({ body: JSON.stringify({ a: 12, b: -3 }) }),
    );
  });

  it('shows API errors separately and keeps the input for correction', async () => {
    respondWith(422, { error: { code: 'DIVISION_BY_ZERO', message: 'division by zero is not allowed' } });
    respondWith(200, { result: 0.5 });
    const { user, display } = setup();

    await user.keyboard('1/0{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot divide by zero');
    expect(display).toHaveTextContent('1 ÷ 0');

    await user.keyboard('{Backspace}2{Enter}');

    expect(await screen.findByText('1 ÷ 2 = 0.5')).toBe(display);
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('asks to calculate first instead of chaining operators', async () => {
    const { user, display } = setup();

    await user.keyboard('5+3*');

    expect(screen.getByRole('alert')).toHaveTextContent('Calculate the current operation first');
    expect(display).toHaveTextContent('5 + 3');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calculates a square root only when equals is pressed', async () => {
    respondWith(200, { result: 3 });
    const { display, click } = setup();

    await click('9', 'Square root');
    expect(display).toHaveTextContent('√(9)');
    expect(fetchMock).not.toHaveBeenCalled();

    await click('Equals');
    expect(await screen.findByText('√(9) = 3')).toBe(display);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/sqrt', expect.objectContaining({ body: JSON.stringify({ a: 9 }) }));
  });

  it.each([
    ['Square root', '1', '0', '0'],
    ['1', 'Square root', '0', '0'],
  ])('allows editable square-root entry: %j', async (...buttons) => {
    respondWith(200, { result: 10 });
    const { display, click } = setup();
    await click(...buttons);
    expect(display).toHaveTextContent('√(100)');
    expect(fetchMock).not.toHaveBeenCalled();
    await click('Equals');
    await screen.findByText('√(100) = 10');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/sqrt', expect.objectContaining({ body: '{"a":100}' }));
  });

  it('rejects an empty square root and lets the user finish it', async () => {
    respondWith(200, { result: 0.5 });
    const { user } = setup();
    await user.keyboard('@{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Incomplete expression');
    expect(fetchMock).not.toHaveBeenCalled();
    await user.keyboard('.25{Enter}');
    await screen.findByText('√(0.25) = 0.5');
  });

  it('edits a percentage operand before evaluating', async () => {
    respondWith(200, { result: -1.005 });
    const { user, click } = setup();
    await user.keyboard('10%0.5');
    await click('Toggle sign');
    expect(fetchMock).not.toHaveBeenCalled();
    await user.keyboard('=');
    await screen.findByText('-100.5% = -1.005');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/percent', expect.objectContaining({ body: '{"a":-100.5}' }));
  });

  it('replaces a pending percentage with multiplication without calculating it', async () => {
    respondWith(200, { result: 2000 });
    const { user } = setup();
    await user.keyboard('10%*200');
    expect(fetchMock).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    await screen.findByText('10 × 200 = 2000');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/multiply', expect.objectContaining({ body: '{"a":10,"b":200}' }));
  });

  it('reuses a percent result in the next operation', async () => {
    respondWith(200, { result: 0.1 });
    respondWith(200, { result: 20 });
    const { user } = setup();

    await user.keyboard('10%{Enter}');
    await screen.findByText('10% = 0.1');
    await user.keyboard('*200{Enter}');
    await screen.findByText('0.1 × 200 = 20');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/multiply',
      expect.objectContaining({ body: JSON.stringify({ a: 0.1, b: 200 }) }),
    );
  });

  it('calculates a power with the keyboard', async () => {
    respondWith(200, { result: 1024 });
    const { user, display } = setup();

    await user.keyboard('2^10{Enter}');

    expect(await screen.findByText('2 ^ 10 = 1024')).toBe(display);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/power', expect.objectContaining({ body: JSON.stringify({ a: 2, b: 10 }) }));
  });

  it('shows the negative square root error and keeps the input', async () => {
    respondWith(422, { error: { code: 'NEGATIVE_SQRT', message: 'square root of a negative number is not allowed' } });
    respondWith(200, { result: 3 });
    const { user, display, click } = setup();

    await user.keyboard('-9@{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot take the square root of a negative number');
    expect(display).toHaveTextContent('√(-9)');
    await click('Toggle sign');
    expect(display).toHaveTextContent('√(9)');
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    await click('Equals');
    await screen.findByText('√(9) = 3');
  });

  it('does not mix percent with a binary operation', async () => {
    const { user, display } = setup();

    await user.keyboard('200+10%');

    expect(screen.getByRole('alert')).toHaveTextContent('√ and % work on a single number');
    expect(display).toHaveTextContent('200 + 10');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an incomplete expression without calling the API', async () => {
    const { user } = setup();

    await user.keyboard('5+{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent('Incomplete expression');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows service unavailable on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { user } = setup();

    await user.keyboard('1+1{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  });

  it('disables the keypad and ignores keys while a request is pending', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { user, display } = setup();

    await user.keyboard('1+1{Enter}');
    expect(screen.getByRole('button', { name: 'Equals' })).toBeDisabled();

    await user.keyboard('9');
    expect(display).toHaveTextContent('1 + 1');

    resolve(new Response(JSON.stringify({ result: 2 })));
    expect(await screen.findByText('1 + 1 = 2')).toBe(display);
    expect(screen.getByRole('button', { name: 'Equals' })).toBeEnabled();
  });

  it('uses the result as the left operand when an operator follows', async () => {
    respondWith(200, { result: 1 / 3 });
    respondWith(200, { result: 1 });
    const { user, display } = setup();

    await user.keyboard('1/3{Enter}');
    await screen.findByText('1 ÷ 3 = 0.333333333333');

    await user.keyboard('*3');
    expect(display).toHaveTextContent('0.3333333333333333 × 3');

    await user.keyboard('{Enter}');
    await screen.findByText('0.3333333333333333 × 3 = 1');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/multiply',
      expect.objectContaining({ body: JSON.stringify({ a: 1 / 3, b: 3 }) }),
    );
  });

  it('starts over when a digit follows a result, and AC clears', async () => {
    respondWith(200, { result: 3 });
    const { user, display, click } = setup();

    await user.keyboard('1+2{Enter}');
    await screen.findByText('1 + 2 = 3');

    await user.keyboard('7');
    expect(display).toHaveTextContent(/^7$/);

    await click('All clear');
    expect(display).toHaveTextContent(/^0$/);
  });
});
