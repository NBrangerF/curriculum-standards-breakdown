import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import KebiaoMotionProvider from '../src/components/KebiaoMotionProvider.jsx'
import '../src/index.css'

export const decorators = [
    Story => (
        <KebiaoMotionProvider>
            <MemoryRouter>
                <div style={{ minHeight: '100vh' }}>
                    <Story />
                </div>
            </MemoryRouter>
        </KebiaoMotionProvider>
    )
]

export const parameters = {
    controls: { expanded: true },
    a11y: {
        test: 'error',
        config: {
            rules: [{ id: 'color-contrast', enabled: true }]
        }
    },
    backgrounds: {
        default: 'kebiao light',
        values: [
            { name: 'kebiao light', value: '#f5f7fb' },
            { name: 'graphite', value: '#080d17' }
        ]
    }
}

export const tags = ['autodocs']
