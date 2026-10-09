import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './providers';
import { AppRouter } from './router';
import '../styles/globals.css';
const container = document.getElementById('root');
if (!container) throw new Error('Elemento root ausente.');
createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
);
