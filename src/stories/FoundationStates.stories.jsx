import React, { useState } from 'react'
import Header from '../components/Header.jsx'
import GradeBandTabs from '../components/GradeBandTabs.jsx'
import FavoriteButton from '../components/FavoriteButton.jsx'
import TSBadge, { TSBadgeGroup } from '../components/TSBadge.jsx'
import { EmptyState, ErrorState, LoadingState, ResultStats } from '../components/StateComponents.jsx'
import GraphLayerPanel from '../features/graph/GraphLayerPanel.jsx'
import '../features/graph/SkillsGraphWorkspace.module.css'

const meta = {
    title: 'Foundation/Production state matrix',
    parameters: {
        layout: 'fullscreen'
    }
}

export default meta

const StoryFrame = ({ title, children, dark = false }) => (
    <section style={{ minHeight: '100vh', padding: 32, color: dark ? '#edf2ff' : '#151a25', background: dark ? '#080d17' : '#f5f7fb' }}>
        <p style={{ margin: '0 0 20px', font: '600 12px/1.2 var(--font-mono)', letterSpacing: '.08em', textTransform: 'uppercase', opacity: .62 }}>{title}</p>
        {children}
    </section>
)

export const GlobalHeader = {
    render: () => <Header />
}

export const GradeTabsInteractive = {
    render: function GradeTabsStory() {
        const [selected, setSelected] = useState(['H2'])
        return (
            <StoryFrame title="default / selected / focus-visible / multi-select">
                <GradeBandTabs selected={selected} onChange={setSelected} />
                <p aria-live="polite" style={{ marginTop: 24 }}>当前选择：{selected.join('、') || '全部'}</p>
            </StoryFrame>
        )
    }
}

export const TransferableSkillBadges = {
    render: () => (
        <StoryFrame title="TS1–TS7 / soft / solid / outline">
            <div style={{ display: 'grid', gap: 24, maxWidth: 720 }}>
                {['soft', 'solid', 'outline'].map(variant => (
                    <div key={variant} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <code style={{ width: 72 }}>{variant}</code>
                        {['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6', 'TS7'].map(code => (
                            <TSBadge key={code} tsId={code} size="md" variant={variant} />
                        ))}
                    </div>
                ))}
                <TSBadgeGroup skills={['TS1', 'TS2', 'TS3', 'TS4']} size="md" max={3} />
            </div>
        </StoryFrame>
    )
}

export const CollectionControl = {
    render: () => (
        <StoryFrame title="default / pressed / popover / checkbox">
            <FavoriteButton code="MA-D2-GE-003" showLabel />
        </StoryFrame>
    )
}

export const AsyncAndResultStates = {
    render: () => (
        <StoryFrame title="loading / empty / error / result count">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
                <LoadingState message="正在建立课程坐标…" />
                <EmptyState />
                <ErrorState onRetry={() => undefined} />
                <ResultStats total={2025} filtered={164} breakdown={{ 数学: 164, 第二学段: 34 }} />
            </div>
        </StoryFrame>
    )
}

export const GraphLayerControls = {
    parameters: { backgrounds: { default: 'graphite' } },
    render: function GraphLayerStory() {
        const [graphState, setGraphState] = useState({ subject: 'math', gradeBand: '', domain: '', focusDepth: 2 })
        const [relationTypes, setRelationTypes] = useState(['contains', 'progression', 'skill_alignment'])
        return (
            <StoryFrame title="graph filter / checkbox / select / pressed" dark>
                <div className="skills-graph-workspace" style={{ maxWidth: 390 }}>
                    <GraphLayerPanel
                        graphState={graphState}
                        subjects={[{ slug: 'math', label: '数学' }, { slug: 'science', label: '科学' }]}
                        gradeBands={[{ value: 'H1', label: '第一学段' }, { value: 'H2', label: '第二学段' }]}
                        domains={['数与运算', '图形与几何']}
                        relationTypes={relationTypes}
                        onFilterChange={patch => setGraphState(state => ({ ...state, ...patch }))}
                        onRelationTypesChange={setRelationTypes}
                        onReset={() => {
                            setGraphState({ subject: '', gradeBand: '', domain: '', focusDepth: 1 })
                            setRelationTypes(['contains', 'progression', 'skill_alignment'])
                        }}
                    />
                </div>
            </StoryFrame>
        )
    }
}
