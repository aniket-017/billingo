import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { BusinessSettingsProvider } from './contexts/BusinessSettingsContext';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BusinessSettingsProvider>
          <App />
        </BusinessSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
