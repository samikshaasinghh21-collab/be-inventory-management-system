import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import "./styles/variables.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/sidebar.css";
import "./styles/header.css";
import "./styles/tables.css";
import "./styles/forms.css";
import "./styles/buttons.css";
import "./styles/cards.css";
import "./styles/utilities.css";
import App from './App.jsx'
import { InventoryProvider } from './context/InventoryContext'
import { NotificationProvider } from './context/NotificationContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <InventoryProvider>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </InventoryProvider>
    </BrowserRouter>
  </StrictMode>,
)
