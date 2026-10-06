import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import AppRoot from './AppRoot'
import './styles.css'
import './components/appearance.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoot />
    </BrowserRouter>
  </StrictMode>,
)
