import type { InputAction } from './calculatorReducer';
import { isDigit } from './symbols';

export function keyToAction(key: string): InputAction | null {
  if (isDigit(key)) return { type: 'digit', digit: key };

  switch (key) {
    case '.':
      return { type: 'decimal' };
    case '+':
      return { type: 'operator', operator: 'add' };
    case '-':
      return { type: 'operator', operator: 'subtract' };
    case '*':
      return { type: 'operator', operator: 'multiply' };
    case '/':
      return { type: 'operator', operator: 'divide' };
    case 'Enter':
    case '=':
      return { type: 'equals' };
    case 'Backspace':
      return { type: 'backspace' };
    case 'Escape':
      return { type: 'clear' };
    default:
      return null;
  }
}
