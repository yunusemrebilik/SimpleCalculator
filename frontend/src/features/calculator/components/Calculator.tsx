import { useCalculator } from '../useCalculator';
import styles from './Calculator.module.css';
import { Keypad } from './Keypad';

export function Calculator() {
  const { display, error, isLoading, press } = useCalculator();

  return (
    <section className={styles.calculator} aria-label="Calculator" aria-busy={isLoading}>
      <output className={styles.display} aria-label="Display">
        {display || '0'}
      </output>
      <p className={styles.error} role="alert">
        {error}
      </p>
      <Keypad onPress={press} disabled={isLoading} />
    </section>
  );
}
