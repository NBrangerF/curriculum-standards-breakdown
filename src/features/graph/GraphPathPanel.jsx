import { useState } from 'react'
import { copyToClipboard } from '../../data/query.js'
import styles from './SkillsGraphWorkspace.module.css'

const TRAVERSAL_LABELS = {
    forward: '沿关系方向',
    reverse: '逆向追溯',
    undirected: '双向关联'
}

const TYPE_LABELS = { subject: '学科', domain: '领域', standard: '标准', skill: '能力' }

export default function GraphPathPanel({ path, selectedNodes }) {
    const [copyState, setCopyState] = useState('idle')

    const copyPathLink = async () => {
        const copied = await copyToClipboard(window.location.href)
        setCopyState(copied ? 'success' : 'error')
        window.setTimeout(() => setCopyState('idle'), 1800)
    }

    if (selectedNodes.length < 2) {
        return (
            <section className={styles['graph-analysis-empty']} aria-labelledby="graph-path-title">
                <h3 id="graph-path-title">路径模式</h3>
                <p>将两个实体加入对比后，系统会只沿当前启用的真实关系寻找最短路径。</p>
            </section>
        )
    }

    if (!path) {
        return (
            <section className={styles['graph-analysis-empty']} aria-labelledby="graph-path-title">
                <h3 id="graph-path-title">当前关系层不可达</h3>
                <p>这两个实体之间没有由当前关系层组成的十步以内路径。可以恢复被关闭的关系层后重试。</p>
            </section>
        )
    }

    return (
        <section className={styles['graph-path-panel']} aria-labelledby="graph-path-title">
            <div className={styles['graph-analysis-heading']}>
                <div>
                    <h3 id="graph-path-title">最短真实路径</h3>
                    <span>{path.steps.length} 步 · {path.relationTypes.join(' + ')}</span>
                </div>
                <button type="button" onClick={copyPathLink}>
                    {copyState === 'success' ? '已复制' : copyState === 'error' ? '复制失败' : '复制路径链接'}
                </button>
            </div>
            <ol className={styles['graph-path-list']}>
                {path.nodes.map((node, index) => {
                    const step = path.steps[index]
                    return (
                        <li key={node.id}>
                            <div>
                                <span>{TYPE_LABELS[node.type] || node.type}</span>
                                <strong>{node.meta?.code || node.label}</strong>
                            </div>
                            {step ? (
                                <p>
                                    <span>{step.edge.label || step.edge.type}</span>
                                    <small>{TRAVERSAL_LABELS[step.traversal]} · 来源 {step.edge.provenance?.field}</small>
                                </p>
                            ) : null}
                        </li>
                    )
                })}
            </ol>
        </section>
    )
}
