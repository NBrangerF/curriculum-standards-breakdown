import { createContext, useContext, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { resolveUiV2Flag } from '../config/uiV2Flags.js'

const UiVersionContext = createContext({ enabled: true, source: 'default', routeKey: 'unknown' })

export function useUiV2() {
    return useContext(UiVersionContext)
}

export default function RouteUiBoundary({ routeKey, children }) {
    const location = useLocation()
    const value = useMemo(
        () => ({ ...resolveUiV2Flag(routeKey, location.search), routeKey }),
        [location.search, routeKey]
    )

    return (
        <UiVersionContext.Provider value={value}>
            <div
                className="route-ui-boundary"
                data-ui-route={routeKey}
                data-ui-version={value.enabled ? 'v2' : 'legacy'}
                data-ui-flag-source={value.source}
                data-ui-rollout-percentage={value.rolloutPercentage ?? undefined}
                data-ui-rollout-bucket={value.rolloutBucket ?? undefined}
            >
                {children}
            </div>
        </UiVersionContext.Provider>
    )
}
