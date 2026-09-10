import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { clearHandoff, importHandoff } from './migrate';
import { installUpdates } from './pwa';

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
import './styles/versus.css';
import './styles/responsive.css';

// Before anything reads storage: a device arriving from the old address
// brings its progress in the URL, and the app must start from it.
importHandoff(window.location.hash);
clearHandoff();

// A Versus screen marks the body while it is up; see VersusScreen.
installUpdates(() => document.body.dataset.versus === '1');

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
