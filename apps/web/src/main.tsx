import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@chiaro/styles.css';
import './app.css';
import { App } from './App';
import { listenInstallPrompt } from './install/platform';
import { registerServiceWorker } from './install/registerSW';
import { createAppRemote } from './supabase';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

listenInstallPrompt();
registerServiceWorker();

createRoot(root).render(
  <StrictMode>
    <App remote={createAppRemote()} />
  </StrictMode>,
);
