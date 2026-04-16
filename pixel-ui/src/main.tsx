import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { setupBridge } from './colyseus-bridge';

async function main() {
  // Connect to Johns Command Center server instead of VS Code
  setupBridge();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main().catch(console.error);
