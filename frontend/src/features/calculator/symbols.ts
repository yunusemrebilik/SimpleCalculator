import type { Operation } from '../../api/calculatorApi';

export type Operator = Operation;

export const OPERATOR_SYMBOLS: Record<Operator, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
};

export const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export type Digit = (typeof DIGITS)[number];

export function isDigit(value: string): value is Digit {
  return (DIGITS as readonly string[]).includes(value);
}
