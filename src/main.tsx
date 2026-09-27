import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/noto-nastaliq-urdu/400.css'
import '@fontsource/noto-nastaliq-urdu/700.css'
import './styles.css'
import { App } from './App'
import { seedDefaults } from './db/db'
import { captureInstallPrompt } from './lib/install'

captureInstallPrompt()
registerSW({ immediate: true })
void seedDefaults()
if (navigator.storage?.persist) void navigator.storage.persist()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
