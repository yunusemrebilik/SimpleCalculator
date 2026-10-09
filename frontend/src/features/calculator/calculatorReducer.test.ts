import { describe, expect, it } from 'vitest';
import {
  type CalculatorAction,
  type CalculatorState,
  type Expression,
  calculatorReducer,
  displayText,
  initialState,
  MAX_DIGITS,
  MESSAGES,
  toRequest,
} from './calculatorReducer';
import { isDigit, type Operator, type UnaryOperator } from './symbols';

const OPERATOR_KEYS: Record<string, Operator> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  '^': 'power',
};
const UNARY_KEYS: Record<string, UnaryOperator> = { r: 'sqrt', '%': 'percent' };

/** Builds actions from a compact key string, e.g. `"12+-3="`; `r` is √, `~` is ±, `<` is backspace, `C` is clear. */
function keys(sequence: string): CalculatorAction[] {
  return [...sequence].map((key): CalculatorAction => {
    if (isDigit(key)) return { type: 'digit', digit: key };
    const operator = OPERATOR_KEYS[key];
    if (operator) return { type: 'operator', operator };
    const unary = UNARY_KEYS[key];
    if (unary) return { type: 'unary', operator: unary };
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
      expect(displayText(press(sequence))).toBe(expected);
    });

    it(`caps a number at ${MAX_DIGITS} digits`, () => {
      const state = press('1'.repeat(MAX_DIGITS + 3));
      expect(displayText(state)).toBe('1'.repeat(MAX_DIGITS));
    });

    it('does not count the sign or decimal point towards the digit cap', () => {
      const digits = '1'.repeat(MAX_DIGITS - 1);
      expect(displayText(press(`-${digits}.9`))).toBe(`-${digits}.9`);
    });

    it('types into the right slot once an operator is set', () => {
      const state = press('12*3.5');
      expect(state.expression).toEqual({ kind: 'binary', left: '12', operator: 'multiply', right: '3.5' });
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
      expect(displayText(press(sequence))).toBe(expected);
    });

    it('applies unary minus to the right operand when it is empty', () => {
      expect(press('12*-3').expression).toMatchObject({ kind: 'binary', operator: 'multiply', right: '-3' });
      expect(press('12--3').expression).toMatchObject({ kind: 'binary', operator: 'subtract', right: '-3' });
    });

    it('toggles the sign of the right operand', () => {
      expect(displayText(press('12+3~'))).toBe('12 + -3');
      expect(displayText(press('12+~'))).toBe('12 + -');
    });
  });

  describe('operators', () => {
    it('replaces the operator while the right operand is empty', () => {
      expect(displayText(press('12+*'))).toBe('12 ×');
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

    it.each(['=', '5=', '5+=', '5+-=', '-=', 'r=', 'r-=', 'r~='])('%s -> incomplete expression error', (sequence) => {
      expect(press(sequence)).toMatchObject({ status: 'idle', error: MESSAGES.incomplete });
    });
  });

  describe('unary operations', () => {
    it.each([
      ['9r', '√(9)'],
      ['r100', '√(100)'],
      ['r', '√()'],
      ['-9r', '√(-9)'],
      ['70%', '70%'],
      ['0.%', '0.%'],
    ])('%s -> "%s"', (sequence, expected) => {
      expect(displayText(press(sequence))).toBe(expected);
    });

    it('waits for equals before sending', () => {
      expect(press('9r')).toMatchObject({ expression: { kind: 'unary', operator: 'sqrt', operand: '9' }, status: 'idle' });
      expect(press('9r=')).toMatchObject({ expression: { kind: 'unary', operator: 'sqrt', operand: '9' }, status: 'loading', error: null });
    });

    it.each([
      ['1r00', '√(100)'],
      ['r.25', '√(0.25)'],
      ['r-.25', '√(-0.25)'],
      ['9r5.~', '√(-95.)'],
      ['10%0', '100%'],
      ['10%.5~', '-10.5%'],
    ])('%s keeps the unary operand editable', (sequence, expected) => {
      expect(displayText(press(sequence))).toBe(expected);
      expect(press(sequence).status).toBe('idle');
    });

    it('enforces the same digit and decimal rules on unary operands', () => {
      expect(displayText(press('r' + '1'.repeat(MAX_DIGITS + 1)))).toBe('√(' + '1'.repeat(MAX_DIGITS) + ')');
      expect(displayText(press('r1..2'))).toBe('√(1.2)');
      expect(displayText(press('r--5'))).toBe('√(-5)');
    });

    it.each<[string, Expression]>([
      ['9r%', { kind: 'unary', operator: 'percent', operand: '9' }],
      ['9r+', { kind: 'binary', operator: 'add', left: '9', right: '' }],
      ['9r-', { kind: 'binary', operator: 'subtract', left: '9', right: '' }],
      ['9+r', { kind: 'unary', operator: 'sqrt', operand: '9' }],
      ['9*%', { kind: 'unary', operator: 'percent', operand: '9' }],
      ['10%*200', { kind: 'binary', operator: 'multiply', left: '10', right: '200' }],
    ])('%s replaces the chosen operation', (sequence, expected) => {
      expect(press(sequence)).toMatchObject({ expression: expected, error: null, status: 'idle' });
    });

    it.each([
      ['%', MESSAGES.enterNumber],
      ['-%', MESSAGES.enterNumber],
      ['r+', MESSAGES.enterNumber],
      ['r-%', MESSAGES.enterNumber],
      ['5+-%', MESSAGES.enterNumber],
      ['200+10%', MESSAGES.singleNumber],
      ['200+10r', MESSAGES.singleNumber],
    ])('%s -> error "%s" without changing the expression', (sequence, message) => {
      const before = press(sequence.slice(0, -1));
      const after = press(sequence);
      expect(after.error).toBe(message);
      expect(displayText(after)).toBe(displayText(before));
    });

    it('removes the unary operation first on backspace', () => {
      const states = ['70%<', '70%<<', '9r<'].map((s) => displayText(press(s)));
      expect(states).toEqual(['70', '7', '9']);
    });

    it('keeps the expression after failure so it can be corrected', () => {
      const failed = calculatorReducer(press('-9r='), { type: 'calculationFailed', error: 'boom' });
      expect(failed).toMatchObject({ status: 'idle', expression: { kind: 'unary', operator: 'sqrt', operand: '-9' }, error: 'boom' });
      expect(displayText(failed)).toBe('√(-9)');
      expect(press('~=', failed)).toMatchObject({ expression: { kind: 'unary', operator: 'sqrt', operand: '9' }, status: 'loading', error: null });
    });

    it('shows the result after success', () => {
      expect(displayText(withResult('9r=', 3))).toBe('√(9) = 3');
      expect(displayText(withResult('70%=', 0.7))).toBe('70% = 0.7');
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
      expect(press('<2=', failed)).toMatchObject({ expression: { kind: 'binary', right: '2' }, status: 'loading', error: null });
    });
  });

  describe('result mode', () => {
    const result = withResult('2*-3=', -6);

    it.each<[string, Expression]>([
      ['7', { kind: 'binary', left: '7', operator: null, right: '' }],
      ['.', { kind: 'binary', left: '0.', operator: null, right: '' }],
      ['+', { kind: 'binary', left: '-6', operator: 'add', right: '' }],
      ['-', { kind: 'binary', left: '-6', operator: 'subtract', right: '' }],
      ['~', { kind: 'binary', left: '6', operator: null, right: '' }],
      ['<', { kind: 'binary', left: '-6', operator: null, right: '' }],
      ['r', { kind: 'unary', operand: '-6', operator: 'sqrt' }],
      ['%', { kind: 'unary', operand: '-6', operator: 'percent' }],
    ])('%s', (sequence, expected) => {
      expect(press(sequence, result)).toMatchObject({ expression: expected, result: null, status: 'idle' });
    });

    it('ignores equals', () => {
      expect(press('=', result)).toBe(result);
    });

    it('chains a new calculation from the result', () => {
      expect(displayText(press('*2', result))).toBe('-6 × 2');
    });

    it('reuses a unary result as the left operand of a binary operation', () => {
      expect(displayText(press('*200', withResult('10%=', 0.1)))).toBe('0.1 × 200');
    });
  });
});

describe('toRequest', () => {
  it.each<[string, ReturnType<typeof toRequest>]>([
    ['', null],
    ['5', null],
    ['5+', null],
    ['5+-', null],
    ['r', null],
    ['r-', null],
    ['r100', { operation: 'sqrt', a: 100 }],
    ['2^10', { operation: 'power', a: 2, b: 10 }],
    ['-1.5*2', { operation: 'multiply', a: -1.5, b: 2 }],
    ['9r', { operation: 'sqrt', a: 9 }],
    ['70%', { operation: 'percent', a: 70 }],
  ])('%j', (sequence, expected) => {
    expect(toRequest(press(sequence).expression)).toEqual(expected);
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
    ['2^10', '2 ^ 10'],
  ])('%s -> "%s"', (sequence, expected) => {
    expect(displayText(press(sequence))).toBe(expected);
  });
});
