import { useEffect, useReducer } from 'react';
import { calculate } from '../../api/calculatorApi';
import { calculatorReducer, displayText, initialState, type InputAction, toRequest } from './calculatorReducer';
import { toErrorMessage } from './errorMessage';
import { keyToAction } from './keyboard';

export const REQUEST_TIMEOUT_MS = 10_000;

export interface Calculator {
  display: string;
  error: string | null;
  isLoading: boolean;
  press: (action: InputAction) => void;
}

export function useCalculator(): Calculator {
  const [state, dispatch] = useReducer(calculatorReducer, initialState);
  const { status, left, operator, right, unary } = state;

  useEffect(() => {
    if (status !== 'loading') return;
    const request = toRequest({ left, operator, right, unary });
    if (request === null) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      dispatch({ type: 'calculationFailed', error: 'Request timed out. Please try again.' });
    }, REQUEST_TIMEOUT_MS);
    calculate(request, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) dispatch({ type: 'calculationSucceeded', result: value });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) dispatch({ type: 'calculationFailed', error: toErrorMessage(error) });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [status, left, operator, right, unary]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Let Enter activate a focused keypad button through its native click event.
      if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return;
      const action = keyToAction(event.key);
      if (action === null) return;
      event.preventDefault();
      dispatch(action);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    display: displayText(state),
    error: state.error,
    isLoading: status === 'loading',
    press: dispatch,
  };
}
