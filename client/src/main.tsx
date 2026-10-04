import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import './index.css';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { CartProvider } from './cart/CartProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
        <App />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);