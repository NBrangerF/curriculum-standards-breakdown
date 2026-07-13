import { Component } from 'react'

/**
 * The visual DAG is supplemental. A failed lazy import or renderer exception
 * must never remove the semantic decision path that surrounds this boundary.
 */
export default class LearningDagRendererBoundary extends Component {
    state = { failed: false }

    static getDerivedStateFromError() {
        return { failed: true }
    }

    render() {
        if (this.state.failed) return this.props.fallback
        return this.props.children
    }
}
