import type { InputAction } from '../calculatorReducer';
import { type Digit, type Operator, OPERATOR_SYMBOLS, UNARY_SYMBOLS, type UnaryOperator } from '../symbols';
import styles from './Keypad.module.css';

interface KeyDefinition {
  label: string;
  ariaLabel?: string;
  action: InputAction;
  variant: 'digit' | 'operator' | 'function' | 'equals';
  wide?: boolean;
  /** Starts a new grid row, leaving the rest of the previous row empty. */
  newRow?: boolean;
}

const digitKey = (digit: Digit, wide = false): KeyDefinition => ({
  label: digit,
  action: { type: 'digit', digit },
  variant: 'digit',
  wide,
});

const operatorKey = (operator: Operator, ariaLabel: string, label = OPERATOR_SYMBOLS[operator]): KeyDefinition => ({
  label,
  ariaLabel,
  action: { type: 'operator', operator },
  variant: 'operator',
});

const unaryKey = (operator: UnaryOperator, ariaLabel: string): KeyDefinition => ({
  label: UNARY_SYMBOLS[operator],
  ariaLabel,
  action: { type: 'unary', operator },
  variant: 'operator',
});

const KEYS: readonly KeyDefinition[] = [
  { label: 'AC', ariaLabel: 'All clear', action: { type: 'clear' }, variant: 'function' },
  { label: '±', ariaLabel: 'Toggle sign', action: { type: 'toggleSign' }, variant: 'function' },
  { label: '⌫', ariaLabel: 'Backspace', action: { type: 'backspace' }, variant: 'function', wide: true },
  { ...unaryKey('sqrt', 'Square root'), newRow: true },
  operatorKey('power', 'Power', 'xʸ'),
  unaryKey('percent', 'Percent'),
  operatorKey('divide', 'Divide'),
  digitKey('7'),
  digitKey('8'),
  digitKey('9'),
  operatorKey('multiply', 'Multiply'),
  digitKey('4'),
  digitKey('5'),
  digitKey('6'),
  operatorKey('subtract', 'Subtract'),
  digitKey('1'),
  digitKey('2'),
  digitKey('3'),
  operatorKey('add', 'Add'),
  digitKey('0', true),
  { label: '.', ariaLabel: 'Decimal point', action: { type: 'decimal' }, variant: 'digit' },
  { label: '=', ariaLabel: 'Equals', action: { type: 'equals' }, variant: 'equals' },
];

interface KeypadProps {
  onPress: (action: InputAction) => void;
  disabled: boolean;
}

export function Keypad({ onPress, disabled }: KeypadProps) {
  return (
    <div className={styles.keypad}>
      {KEYS.map((key) => (
        <button
          key={key.label}
          type="button"
          className={`${styles.key} ${styles[key.variant]} ${key.wide ? styles.wide : ''} ${key.newRow ? styles.newRow : ''}`}
          aria-label={key.ariaLabel}
          disabled={disabled}
          onClick={() => onPress(key.action)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
