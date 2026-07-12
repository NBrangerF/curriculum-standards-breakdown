import { LazyMotion, MotionConfig } from 'motion/react'

const loadMotionFeatures = () => import('../motion-features.js').then(module => module.default)

function KebiaoMotionProvider({ children }) {
    return (
        <MotionConfig
            reducedMotion="user"
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
            <LazyMotion features={loadMotionFeatures} strict>
                {children}
            </LazyMotion>
        </MotionConfig>
    )
}

export default KebiaoMotionProvider
