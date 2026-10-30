import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { resolveLegacyCode } from '../data/v2Data.js'
import { PageLoading } from '../components/StateComponents'

// The previous standard page, kept for any old code the v2 map does not know.
const StandardDetailPage = lazy(() => import('./StandardDetailPage'))

// Old (v1) codes such as MA-D1-NA-001 now live on a v2 standard page, opened at the 要点 the old record joined.
// The server answers these with a 301 (middleware.js); this covers links followed inside the app.
export default function LegacyStandardRedirect({ code }) {
    const [target, setTarget] = useState(undefined)
    useEffect(() => {
        let cancelled = false
        setTarget(undefined)
        resolveLegacyCode(code)
            .then(path => { if (!cancelled) setTarget(path) })
            .catch(() => { if (!cancelled) setTarget(null) })
        return () => { cancelled = true }
    }, [code])

    if (target === undefined) return <PageLoading className="page-content container" message={`正在查找 ${code} 的新位置…`} />
    if (target === null) return <Suspense fallback={<PageLoading message={`加载标准 ${code}…`} />}><StandardDetailPage /></Suspense>
    const [path, anchor] = target.split('#')
    const search = path.startsWith('/standards/') ? `?from=${encodeURIComponent(code)}` : ''
    return <Navigate to={`${path}${search}${anchor ? `#${anchor}` : ''}`} replace />
}
