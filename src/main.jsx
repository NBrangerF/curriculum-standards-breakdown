import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import KebiaoMotionProvider from './components/KebiaoMotionProvider.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <KebiaoMotionProvider>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </KebiaoMotionProvider>
    </React.StrictMode>,
)
