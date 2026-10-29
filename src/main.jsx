import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import KebiaoMotionProvider from './components/KebiaoMotionProvider.jsx'
import '@fontsource-variable/noto-serif-sc/wght.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './index.css'
import { capturePrerenderSnapshot } from './seo/prerenderSnapshot.js'

// Rendering clears #root, so keep the prerendered page content first.
capturePrerenderSnapshot()

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <KebiaoMotionProvider>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </KebiaoMotionProvider>
    </React.StrictMode>,
)
