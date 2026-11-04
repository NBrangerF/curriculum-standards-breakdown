import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import KebiaoMotionProvider from './components/KebiaoMotionProvider.jsx'
// 星表 type: Geist + Noto Sans SC for text, Geist Mono for codes. Noto Serif SC only draws the 课标 glyph in the sky.
import '@fontsource-variable/noto-sans-sc/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import '@fontsource-variable/noto-serif-sc/wght.css'
import './styles/fonts.css'
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
