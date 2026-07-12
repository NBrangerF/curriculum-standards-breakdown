import { m } from 'motion/react'
import styles from './CurriculumCoordinateMap.module.css'

const TRACKS = [
    { className: 'track-one', label: '学科' },
    { className: 'track-two', label: '领域' },
    { className: 'track-three', label: '标准' }
]

const NODES = [
    { className: 'node-subject', label: '数学', type: 'subject' },
    { className: 'node-stage', label: '第二学段', type: 'stage' },
    { className: 'node-domain', label: '图形与几何', type: 'domain' },
    { className: 'node-standard', label: 'MA-D2-GE-003', type: 'standard' }
]

const mapSequence = {
    hidden: {},
    visible: {
        transition: {
            delayChildren: 0.18,
            staggerChildren: 0.075
        }
    }
}

const nodeReveal = {
    hidden: { opacity: 0, y: 9, scale: 0.975 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.44, ease: [0.16, 1, 0.3, 1] }
    }
}

function CurriculumCoordinateMap() {
    return (
        <m.div
            className={styles['curriculum-coordinate']}
            aria-hidden="true"
            variants={mapSequence}
            initial="hidden"
            animate="visible"
        >
            <div className={styles['coordinate-surface']}>
                <div className={`${styles['coordinate-axis']} ${styles['coordinate-axis-y']}`}></div>
                <div className={`${styles['coordinate-axis']} ${styles['coordinate-axis-x']}`}></div>

                {TRACKS.map(track => (
                    <div key={track.className} className={`${styles['coordinate-track']} ${styles[track.className]}`}>
                        <span>{track.label}</span>
                    </div>
                ))}

                <svg className={styles['coordinate-relations']} viewBox="0 0 620 300" preserveAspectRatio="none">
                    <m.path variants={nodeReveal} d="M118 67 L302 139" />
                    <m.path variants={nodeReveal} d="M454 66 L302 139" />
                    <m.path variants={nodeReveal} d="M302 139 L456 224" />
                    <m.path variants={nodeReveal} className={styles['relation-dashed']} d="M120 225 L302 139" />
                </svg>

                {NODES.map(node => (
                    <m.span
                        key={node.className}
                        className={`${styles['coordinate-node']} ${styles[node.className]} ${node.type === 'standard' ? styles['is-standard'] : ''}`}
                        variants={nodeReveal}
                    >
                        {node.label}
                    </m.span>
                ))}

                <span className={`${styles['coordinate-caption']} ${styles['coordinate-caption-y']}`}>课程结构</span>
                <span className={`${styles['coordinate-caption']} ${styles['coordinate-caption-x']}`}>学段定位</span>
            </div>
        </m.div>
    )
}

export default CurriculumCoordinateMap
