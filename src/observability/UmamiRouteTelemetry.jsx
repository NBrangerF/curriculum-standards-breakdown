import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { trackUmamiEvent } from './umamiTelemetry.js'

function safeDecode(value) {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

export default function UmamiRouteTelemetry() {
    const { pathname, search } = useLocation()
    const previousPathRef = useRef('')
    const learningMapOpenRef = useRef(false)

    useEffect(() => {
        if (previousPathRef.current !== pathname) {
            previousPathRef.current = pathname
            const subjectMatch = pathname.match(/^\/subjects\/([^/]+)$/u)
            const standardMatch = pathname.match(/^\/standards\/([^/]+)$/u)

            if (subjectMatch) {
                trackUmamiEvent('subject_open', { subject_slug: safeDecode(subjectMatch[1]) })
            } else if (standardMatch) {
                trackUmamiEvent('standard_open', { standard_code: safeDecode(standardMatch[1]) })
            } else if (pathname === '/smart-search') {
                trackUmamiEvent('smart_search_open')
            } else if (pathname === '/api') {
                trackUmamiEvent('api_docs_open')
            }
        }

        const standardMatch = pathname.match(/^\/standards\/([^/]+)$/u)
        const learningMapOpen = Boolean(standardMatch) && new URLSearchParams(search).get('view') === 'learning-map'
        if (learningMapOpen && !learningMapOpenRef.current) {
            trackUmamiEvent('learning_map_open', { standard_code: safeDecode(standardMatch[1]) })
        }
        learningMapOpenRef.current = learningMapOpen
    }, [pathname, search])

    return null
}
