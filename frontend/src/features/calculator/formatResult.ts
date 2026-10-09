const formatter = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 12,
  useGrouping: false,
  signDisplay: 'negative',
});

const operandFormatter = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 21,
  useGrouping: false,
  signDisplay: 'negative',
});

/** Readable display precision without rounding small nonzero values to zero. */
export function formatResult(value: number): string {
  return formatter.format(value);
}

/** Preserve the number's round-trip precision in an editable, exponent-free string. */
export function resultToOperand(value: number): string {
  return operandFormatter.format(value);
}
