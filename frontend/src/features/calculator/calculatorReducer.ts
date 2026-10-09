import type { CalculationRequest } from '../../api/calculatorApi';
import { type Digit, type Operator, OPERATOR_SYMBOLS, UNARY_SYMBOLS, type UnaryOperator } from './symbols';
import { formatResult, resultToOperand } from './formatResult';

export interface CalculatorState {
  left: string;
  operator: Operator | null;
  right: string;
  /** When set, `operator` is null and `right` is empty. */
  unary: UnaryOperator | null;
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

export const initialState: CalculatorState = {
  left: '',
  operator: null,
  right: '',
  unary: null,
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
  const expression = expressionText(state);
  return state.result === null ? expression : `${expression} = ${formatResult(state.result)}`;
}

function expressionText({ left, operator, right, unary }: CalculatorState): string {
  if (unary === 'sqrt') return `${UNARY_SYMBOLS.sqrt}${left}`;
  if (unary === 'percent') return `${left}${UNARY_SYMBOLS.percent}`;
  return [left, operator && OPERATOR_SYMBOLS[operator], right].filter(Boolean).join(' ');
}

export function canSubmit({ left, operator, right, unary }: CalculatorState): boolean {
  return isComplete(left) && (unary !== null || (operator !== null && isComplete(right)));
}

export function toRequest({
  left,
  operator,
  right,
  unary,
}: Pick<CalculatorState, 'left' | 'operator' | 'right' | 'unary'>): CalculationRequest | null {
  if (unary !== null) return { operation: unary, a: Number(left) };
  if (operator !== null) return { operation: operator, a: Number(left), b: Number(right) };
  return null;
}

type Slot = 'left' | 'right';

function applyInput(state: CalculatorState, action: InputAction): CalculatorState {
  const slot: Slot = state.operator === null ? 'left' : 'right';
  const value = state[slot];
  // √ and % close the number they apply to.
  const editable = state.unary === null;

  switch (action.type) {
    case 'digit':
      return editable ? updateSlot(state, slot, appendDigit(value, action.digit)) : state;
    case 'decimal':
      return editable ? updateSlot(state, slot, appendDecimal(value)) : state;
    case 'toggleSign':
      return editable ? updateSlot(state, slot, toggleSign(value)) : state;
    case 'operator':
      return applyOperator(state, action.operator, slot, value);
    case 'unary':
      return applyUnary(state, action.operator);
    case 'equals':
      return canSubmit(state) ? { ...state, status: 'loading', error: null } : reject(state, MESSAGES.incomplete);
    case 'backspace':
      return backspace(state);
    case 'clear':
      return initialState;
  }
}

function applyOperator(state: CalculatorState, operator: Operator, slot: Slot, value: string): CalculatorState {
  if (operator === 'subtract') {
    if (value === '') return updateSlot(state, slot, '-');
    if (value === '-') return state;
  }
  if (!isComplete(state.left) || state.right === '-') return reject(state, MESSAGES.enterNumber);
  if (state.right !== '') return reject(state, MESSAGES.calculateFirst);
  return accept(state, { operator, unary: null });
}

function applyUnary(state: CalculatorState, unary: UnaryOperator): CalculatorState {
  if (!isComplete(state.left) || state.right === '-') return reject(state, MESSAGES.enterNumber);
  if (state.right !== '') return reject(state, MESSAGES.singleNumber);
  return accept(state, { operator: null, unary });
}

function applyInputToResult(state: CalculatorState, result: string, action: InputAction): CalculatorState {
  switch (action.type) {
    case 'digit':
      return { ...initialState, left: action.digit };
    case 'decimal':
      return { ...initialState, left: '0.' };
    case 'toggleSign':
      return { ...initialState, left: toggleSign(result) };
    case 'operator':
      return { ...initialState, left: result, operator: action.operator };
    case 'unary':
      return { ...initialState, left: result, unary: action.operator };
    case 'backspace':
      return { ...initialState, left: result };
    case 'clear':
      return initialState;
    case 'equals':
      return state;
  }
}

function backspace(state: CalculatorState): CalculatorState {
  if (state.unary !== null) return accept(state, { unary: null });
  if (state.right !== '') return accept(state, { right: state.right.slice(0, -1) });
  if (state.operator !== null) return accept(state, { operator: null });
  if (state.left !== '') return accept(state, { left: state.left.slice(0, -1) });
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
function updateSlot(state: CalculatorState, slot: Slot, value: string | null): CalculatorState {
  if (value === null) return state;
  return accept(state, slot === 'left' ? { left: value } : { right: value });
}

function accept(state: CalculatorState, changes: Partial<CalculatorState>): CalculatorState {
  return { ...state, ...changes, error: null };
}

function reject(state: CalculatorState, error: string): CalculatorState {
  return { ...state, error };
}
