import { describe, expect, it } from 'vitest';
import {
  type CalculatorAction,
  type CalculatorState,
  calculatorReducer,
  displayText,
  initialState,
  MAX_DIGITS,
  MESSAGES,
} from './calculatorReducer';
import { isDigit, type Operator } from './symbols';

const OPERATOR_KEYS: Record<string, Operator> = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide' };

/** Builds actions from a compact key string, e.g. `"12+-3="`; `~` is ±, `<` is backspace, `C` is clear. */
function keys(sequence: string): CalculatorAction[] {
  return [...sequence].map((key): CalculatorAction => {
    if (isDigit(key)) return { type: 'digit', digit: key };
    const operator = OPERATOR_KEYS[key];
    if (operator) return { type: 'operator', operator };
    switch (key) {
      case '.':
        return { type: 'decimal' };
      case '~':
        return { type: 'toggleSign' };
      case '=':
        return { type: 'equals' };
      case '<':
        return { type: 'backspace' };
      case 'C':
        return { type: 'clear' };
      default:
        throw new Error(`unknown key ${key}`);
    }
  });
}

function press(sequence: string, from: CalculatorState = initialState): CalculatorState {
  return keys(sequence).reduce(calculatorReducer, from);
}

function withResult(sequence: string, result: number): CalculatorState {
  return calculatorReducer(press(sequence), { type: 'calculationSucceeded', result });
}

describe('calculatorReducer', () => {
  describe('number entry', () => {
    it.each([
      ['12', '12'],
      ['0', '0'],
      ['00', '0'],
      ['05', '5'],
      ['1.5', '1.5'],
      ['.5', '0.5'],
      ['1..5', '1.5'],
      ['1.2.3', '1.23'],
      ['10.0', '10.0'],
    ])('%s -> %s', (sequence, expected) => {
      expect(press(sequence).left).toBe(expected);
    });

    it(`caps a number at ${MAX_DIGITS} digits`, () => {
      const state = press('1'.repeat(MAX_DIGITS + 3));
      expect(state.left).toBe('1'.repeat(MAX_DIGITS));
    });

    it('does not count the sign or decimal point towards the digit cap', () => {
      const digits = '1'.repeat(MAX_DIGITS - 1);
      expect(press(`-${digits}.9`).left).toBe(`-${digits}.9`);
    });

    it('types into the right slot once an operator is set', () => {
      const state = press('12*3.5');
      expect(state).toMatchObject({ left: '12', operator: 'multiply', right: '3.5' });
    });
  });

  describe('sign', () => {
    it.each([
      ['-', '-'],
      ['-5', '-5'],
      ['-0', '-0'],
      ['-05', '-5'],
      ['-.', '-0.'],
      ['~', '-'],
      ['~~', ''],
      ['5~', '-5'],
      ['5~~', '5'],
      ['--', '-'],
    ])('%s -> left %s', (sequence, expected) => {
      expect(press(sequence).left).toBe(expected);
    });

    it('applies unary minus to the right operand when it is empty', () => {
      expect(press('12*-3')).toMatchObject({ operator: 'multiply', right: '-3' });
      expect(press('12--3')).toMatchObject({ operator: 'subtract', right: '-3' });
    });

    it('toggles the sign of the right operand', () => {
      expect(press('12+3~').right).toBe('-3');
      expect(press('12+~').right).toBe('-');
    });
  });

  describe('operators', () => {
    it('replaces the operator while the right operand is empty', () => {
      expect(press('12+*').operator).toBe('multiply');
    });

    it.each([
      ['+', MESSAGES.enterNumber],
      ['-+', MESSAGES.enterNumber],
      ['5+-*', MESSAGES.enterNumber],
      ['5+3*', MESSAGES.calculateFirst],
      ['5+3-', MESSAGES.calculateFirst],
    ])('%s -> error "%s" without changing the expression', (sequence, message) => {
      const before = press(sequence.slice(0, -1));
      const after = press(sequence);
      expect(after.error).toBe(message);
      expect(displayText(after)).toBe(displayText(before));
    });
  });

  describe('equals', () => {
    it('starts loading when the expression is complete', () => {
      expect(press('12/4=')).toMatchObject({ status: 'loading', error: null });
    });

    it.each(['=', '5=', '5+=', '5+-=', '-='])('%s -> incomplete expression error', (sequence) => {
      expect(press(sequence)).toMatchObject({ status: 'idle', error: MESSAGES.incomplete });
    });
  });

  describe('backspace', () => {
    it('deletes backwards across right, operator and left', () => {
      const states = ['12+3<', '12+3<<', '12+3<<<', '12+3<<<<', '12+3<<<<<'].map((s) => displayText(press(s)));
      expect(states).toEqual(['12 +', '12', '1', '', '']);
    });
  });

  describe('clear', () => {
    it('resets everything', () => {
      expect(press('12+3C')).toEqual(initialState);
      expect(calculatorReducer(withResult('1+2=', 3), { type: 'clear' })).toEqual(initialState);
    });
  });

  describe('errors', () => {
    it('clears the error on the next accepted key', () => {
      expect(press('+').error).toBe(MESSAGES.enterNumber);
      expect(press('+5').error).toBeNull();
    });

    it('keeps the error when the key is ignored', () => {
      expect(press('5..=.').error).toBe(MESSAGES.incomplete);
    });
  });

  describe('request lifecycle', () => {
    it('ignores input while loading', () => {
      const loading = press('1+2=');
      expect(press('9<C', loading)).toBe(loading);
    });

    it('shows the result after success', () => {
      const state = withResult('12/4=', 3);
      expect(state).toMatchObject({ status: 'idle', result: 3 });
      expect(displayText(state)).toBe('12 ÷ 4 = 3');
    });

    it('keeps the expression and shows the error after failure', () => {
      const state = calculatorReducer(press('1/0='), { type: 'calculationFailed', error: 'Cannot divide by zero' });
      expect(state).toMatchObject({ status: 'idle', result: null, error: 'Cannot divide by zero' });
      expect(displayText(state)).toBe('1 ÷ 0');
    });

    it('lets the user correct the input and retry after failure', () => {
      const failed = calculatorReducer(press('1/0='), { type: 'calculationFailed', error: 'Cannot divide by zero' });
      expect(press('<2=', failed)).toMatchObject({ right: '2', status: 'loading', error: null });
    });
  });

  describe('result mode', () => {
    const result = withResult('2*-3=', -6);

    it.each<[string, Partial<CalculatorState>]>([
      ['7', { left: '7', operator: null, right: '', result: null }],
      ['.', { left: '0.', operator: null, right: '', result: null }],
      ['+', { left: '-6', operator: 'add', right: '', result: null }],
      ['-', { left: '-6', operator: 'subtract', right: '', result: null }],
      ['~', { left: '6', operator: null, right: '', result: null }],
      ['<', { left: '-6', operator: null, right: '', result: null }],
    ])('%s', (sequence, expected) => {
      expect(press(sequence, result)).toMatchObject(expected);
    });

    it('ignores equals', () => {
      expect(press('=', result)).toBe(result);
    });

    it('chains a new calculation from the result', () => {
      expect(displayText(press('*2', result))).toBe('-6 × 2');
    });
  });
});

describe('displayText', () => {
  it.each<[string, string]>([
    ['', ''],
    ['12', '12'],
    ['12+', '12 +'],
    ['12--3', '12 − -3'],
    ['1.5*2', '1.5 × 2'],
    ['8/2', '8 ÷ 2'],
  ])('%s -> "%s"', (sequence, expected) => {
    expect(displayText(press(sequence))).toBe(expected);
  });
});
