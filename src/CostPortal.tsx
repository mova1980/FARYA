import React from 'react';
import App from './App';
import { AuthGate } from './components/AuthGate';
import { StoreProvider } from './lib/store';

export default function CostPortal() {
  return (
    <AuthGate>
      <StoreProvider><App /></StoreProvider>
    </AuthGate>
  );
}
