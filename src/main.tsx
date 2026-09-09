import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Load order is the cascade: tokens, then element defaults, then components,
// then the breakpoint overrides that have to win on equal specificity.
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/map.css';
import './styles/controls.css';
import './styles/roster.css';
import './styles/cards.css';
import './styles/roll.css';
import './styles/hooks.css';
import './styles/progress.css';
import './styles/responsive.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
