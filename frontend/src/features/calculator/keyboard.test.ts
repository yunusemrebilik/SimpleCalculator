import { describe, expect, it } from 'vitest';
import { keyToAction } from './keyboard';

describe('keyToAction', () => {
  it.each([
    ['7', { type: 'digit', digit: '7' }],
    ['.', { type: 'decimal' }],
    ['+', { type: 'operator', operator: 'add' }],
    ['-', { type: 'operator', operator: 'subtract' }],
    ['*', { type: 'operator', operator: 'multiply' }],
    ['/', { type: 'operator', operator: 'divide' }],
    ['Enter', { type: 'equals' }],
    ['=', { type: 'equals' }],
    ['Backspace', { type: 'backspace' }],
    ['Escape', { type: 'clear' }],
  ])('%s', (key, expected) => {
    expect(keyToAction(key)).toEqual(expected);
  });

  it.each(['a', ' ', 'Tab', 'F5', '10'])('ignores %j', (key) => {
    expect(keyToAction(key)).toBeNull();
  });
});
