import type { CalculationRequest } from '../../api/calculatorApi';
import { type Digit, type Operator, OPERATOR_SYMBOLS, UNARY_SYMBOLS, type UnaryOperator } from './symbols';
import { formatResult, resultToOperand } from './formatResult';

export type Expression =
  | { kind: 'binary'; left: string; operator: Operator | null; right: string }
  | { kind: 'unary'; operator: UnaryOperator; operand: string };

export interface CalculatorState {
  expression: Expression;
  /** Raw API result; formatting must not change the value used for chaining. */
  result: number | null;
  status: 'idle' | 'loading';
  error: string | null;
}

export type InputAction =
  | { type: 'digit'; digit: Digit }
  | { type: 'decimal' }
  | { type: 'toggleSign' }
  | { type: 'operator'; operator: Operator }
  | { type: 'unary'; operator: UnaryOperator }
  | { type: 'equals' }
  | { type: 'backspace' }
  | { type: 'clear' };

export type CalculatorAction =
  | InputAction
  | { type: 'calculationSucceeded'; result: number }
  | { type: 'calculationFailed'; error: string };

export const MAX_DIGITS = 15;

export const MESSAGES = {
  enterNumber: 'Enter a number first',
  calculateFirst: 'Calculate the current operation first',
  singleNumber: '√ and % work on a single number',
  incomplete: 'Incomplete expression',
} as const;

function binaryExpression(left = '', operator: Operator | null = null, right = ''): Expression {
  return { kind: 'binary', left, operator, right };
}

export const initialState: CalculatorState = {
  expression: binaryExpression(),
  result: null,
  status: 'idle',
  error: null,
};

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'calculationSucceeded':
      return { ...state, status: 'idle', result: action.result };
    case 'calculationFailed':
      return { ...state, status: 'idle', error: action.error };
  }

  if (state.status === 'loading') return state;
  return state.result === null ? applyInput(state, action) : applyInputToResult(state, resultToOperand(state.result), action);
}

export function displayText(state: CalculatorState): string {
  const expression = expressionText(state.expression);
  return state.result === null ? expression : `${expression} = ${formatResult(state.result)}`;
}

function expressionText(expression: Expression): string {
  if (expression.kind === 'unary') {
    return expression.operator === 'sqrt'
      ? `${UNARY_SYMBOLS.sqrt}(${expression.operand})`
      : `${expression.operand}${UNARY_SYMBOLS.percent}`;
  }
  const { left, operator, right } = expression;
  return [left, operator && OPERATOR_SYMBOLS[operator], right].filter(Boolean).join(' ');
}

/** Incomplete expressions cannot become API requests (in particular, empty input is not zero). */
export function toRequest(expression: Expression): CalculationRequest | null {
  if (expression.kind === 'unary') {
    return isComplete(expression.operand) ? { operation: expression.operator, a: Number(expression.operand) } : null;
  }
  const { left, operator, right } = expression;
  return isComplete(left) && operator !== null && isComplete(right)
    ? { operation: operator, a: Number(left), b: Number(right) }
    : null;
}

function activeOperand(expression: Expression): string {
  if (expression.kind === 'unary') return expression.operand;
  return expression.operator === null ? expression.left : expression.right;
}

function applyInput(state: CalculatorState, action: InputAction): CalculatorState {
  const value = activeOperand(state.expression);
  switch (action.type) {
    case 'digit':
      return updateOperand(state, appendDigit(value, action.digit));
    case 'decimal':
      return updateOperand(state, appendDecimal(value));
    case 'toggleSign':
      return updateOperand(state, toggleSign(value));
    case 'operator':
      return applyOperator(state, action.operator);
    case 'unary':
      return applyUnary(state, action.operator);
    case 'equals':
      return toRequest(state.expression) !== null
        ? { ...state, status: 'loading', error: null }
        : reject(state, MESSAGES.incomplete);
    case 'backspace':
      return backspace(state);
    case 'clear':
      return initialState;
  }
}

function applyOperator(state: CalculatorState, operator: Operator): CalculatorState {
  const expression = state.expression;
  const value = activeOperand(expression);
  if (operator === 'subtract') {
    if (value === '') return updateOperand(state, '-');
    if (value === '-') return state;
  }
  const left = expression.kind === 'unary' ? expression.operand : expression.left;
  if (!isComplete(left) || (expression.kind === 'binary' && expression.right === '-')) {
    return reject(state, MESSAGES.enterNumber);
  }
  if (expression.kind === 'binary' && expression.right !== '') return reject(state, MESSAGES.calculateFirst);
  return accept(state, binaryExpression(left, operator));
}

function applyUnary(state: CalculatorState, operator: UnaryOperator): CalculatorState {
  const expression = state.expression;
  if (expression.kind === 'binary') {
    if (expression.right === '-') return reject(state, MESSAGES.enterNumber);
    if (expression.right !== '') return reject(state, MESSAGES.singleNumber);
  }
  const operand = expression.kind === 'unary' ? expression.operand : expression.left;
  // Square root can be selected first; percentage retains its number-then-% entry order.
  if (operator === 'percent' && !isComplete(operand)) return reject(state, MESSAGES.enterNumber);
  return accept(state, { kind: 'unary', operator, operand });
}

function applyInputToResult(state: CalculatorState, result: string, action: InputAction): CalculatorState {
  const continued = { ...initialState, expression: binaryExpression(result) };
  switch (action.type) {
    case 'digit':
    case 'decimal':
    case 'clear':
      return applyInput(initialState, action);
    case 'toggleSign':
    case 'operator':
    case 'unary':
      return applyInput(continued, action);
    case 'backspace':
      return continued;
    case 'equals':
      return state;
  }
}

function backspace(state: CalculatorState): CalculatorState {
  const expression = state.expression;
  if (expression.kind === 'unary') return accept(state, binaryExpression(expression.operand));
  if (expression.right !== '') return accept(state, { ...expression, right: expression.right.slice(0, -1) });
  if (expression.operator !== null) return accept(state, { ...expression, operator: null });
  if (expression.left !== '') return accept(state, { ...expression, left: expression.left.slice(0, -1) });
  return state;
}

function appendDigit(value: string, digit: Digit): string | null {
  if (value.replace(/\D/g, '').length >= MAX_DIGITS) return null;
  if (value === '0') return digit;
  if (value === '-0') return `-${digit}`;
  return value + digit;
}

function appendDecimal(value: string): string | null {
  if (value.includes('.')) return null;
  if (value === '' || value === '-') return `${value}0.`;
  return `${value}.`;
}

function toggleSign(value: string): string {
  return value.startsWith('-') ? value.slice(1) : `-${value}`;
}

function isComplete(value: string): boolean {
  return value !== '' && value !== '-';
}

/** `null` means the key does not apply, so the state (including any error) is left untouched. */
function updateOperand(state: CalculatorState, value: string | null): CalculatorState {
  if (value === null) return state;
  const expression = state.expression;
  if (expression.kind === 'unary') return accept(state, { ...expression, operand: value });
  return accept(state, expression.operator === null ? { ...expression, left: value } : { ...expression, right: value });
}

function accept(state: CalculatorState, expression: Expression): CalculatorState {
  return { ...state, expression, error: null };
}

function reject(state: CalculatorState, error: string): CalculatorState {
  return { ...state, error };
}
