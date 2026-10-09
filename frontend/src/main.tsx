import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Calculator } from './features/calculator/components/Calculator';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="app">
      <Calculator />
    </main>
  </StrictMode>,
);
