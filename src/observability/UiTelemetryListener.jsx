import { useEffect } from 'react'
import { trackUiTask } from './uiTaskTelemetry.js'

export default function UiTelemetryListener() {
    useEffect(() => {
        const reportedStates = new WeakSet()
        const reportState = element => {
            if (!element || reportedStates.has(element)) return
            const isReady = element.matches?.('[data-kb-component="graph-canvas"][data-kb-ready="true"]')
            const state = isReady ? 'graph_ready' : element.dataset?.kbTelemetryState
            if (!state) return
            reportedStates.add(element)
            void trackUiTask(state, element)
        }
        const scanStates = root => {
            reportState(root)
            root.querySelectorAll?.('[data-kb-component="graph-canvas"][data-kb-ready="true"], [data-kb-telemetry-state]')
                .forEach(reportState)
        }
        const handleClick = event => {
            const trigger = event.target.closest?.('[data-kb-telemetry-task]')
            if (!trigger) return
            void trackUiTask(trigger.dataset.kbTelemetryTask, trigger)
        }
        const observer = new MutationObserver(records => records.forEach(record => {
            if (record.type === 'attributes') reportState(record.target)
            record.addedNodes.forEach(scanStates)
        }))
        document.addEventListener('click', handleClick, { capture: true })
        scanStates(document)
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-kb-ready'] })
        return () => {
            document.removeEventListener('click', handleClick, { capture: true })
            observer.disconnect()
        }
    }, [])

    return null
}
