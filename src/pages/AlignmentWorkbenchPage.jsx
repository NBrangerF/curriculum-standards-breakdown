import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addToCollection } from '../data/collections'
import { postApi } from '../data/api'
import styles from './AlignmentWorkbenchPage.module.css'

const SAMPLE = `三年级科学植物观察计划
学科：科学
年级：三年级
单元一：植物生命周期观察
学习目标：观察植物结构，持续记录变化，并用证据交流发现`

const SUBJECTS = [
    ['chinese', '语文'], ['math', '数学'], ['english', '英语'], ['science', '科学'],
    ['morality_law', '道德与法治'], ['arts', '艺术'], ['pe', '体育与健康'], ['labor', '劳动'], ['it', '信息科技']
]

function AlignmentWorkbenchPage() {
    const [text, setText] = useState(SAMPLE)
    const [plan, setPlan] = useState(null)
    const [matches, setMatches] = useState(null)
    const [decisions, setDecisions] = useState({})
    const [coverage, setCoverage] = useState(null)
    const [status, setStatus] = useState('')
    const [error, setError] = useState('')

    const decisionList = useMemo(() => Object.entries(decisions).map(([key, decision]) => {
        const [unit_id, code] = key.split('::')
        return { unit_id, code, decision }
    }), [decisions])
    const acceptedCodes = useMemo(() => decisionList.filter(item => item.decision === 'accepted').map(item => item.code), [decisionList])

    async function parse() {
        setStatus('正在解析计划…'); setError(''); setMatches(null); setCoverage(null); setDecisions({})
        try {
            const payload = await postApi('/api/v1/plans/parse', { text })
            setPlan(payload.data.plan)
            setStatus(payload.data.warnings?.join(' ') || '计划已解析，请先复核结构。')
        } catch (requestError) { setError(requestError.message); setStatus('') }
    }

    function updatePlan(field, value) { setPlan(previous => ({ ...previous, [field]: value })) }
    function updateUnit(index, field, value) {
        setPlan(previous => ({
            ...previous,
            units: previous.units.map((unit, unitIndex) => unitIndex === index
                ? { ...unit, [field]: field === 'learning_goals' ? value.split('\n').map(item => item.trim()).filter(Boolean) : value }
                : unit)
        }))
    }

    async function match() {
        if (!plan) return
        setStatus('正在检索候选标准…'); setError(''); setCoverage(null)
        try {
            const validation = await postApi('/api/v1/plans/validate', { plan })
            if (!validation.data.valid) throw new Error(validation.data.errors.join('；'))
            const payload = await postApi('/api/v1/plans/match-standards', { plan: validation.data.normalized_plan, top_k_per_unit: 5 })
            setPlan(validation.data.normalized_plan)
            setMatches(payload.data)
            setDecisions({})
            setStatus('匹配完成。请逐条接受或拒绝；未复核候选不会计入覆盖。')
        } catch (requestError) { setError(requestError.message); setStatus('') }
    }

    async function analyze() {
        if (!plan || !matches) return
        setStatus('正在根据教师决定计算覆盖…'); setError('')
        try {
            const payload = await postApi('/api/v1/plans/analyze-coverage', {
                plan,
                matches,
                review_decisions: decisionList
            })
            setCoverage(payload.data)
            setStatus('覆盖只统计已接受候选；未设置参考标准范围，因此不会生成“缺口”结论。')
        } catch (requestError) { setError(requestError.message); setStatus('') }
    }

    function decide(unitId, code, decision) {
        setDecisions(previous => ({ ...previous, [`${unitId}::${code}`]: decision }))
        setCoverage(null)
    }

    function saveAccepted() {
        acceptedCodes.forEach(code => addToCollection(code))
        setStatus(`已将 ${new Set(acceptedCodes).size} 条已接受标准加入“我的收藏”。`)
    }

    return (
        <div className={styles.root} data-kb-route="alignment-workbench">
            <header className={styles.hero}>
                <div className="container">
                    <p className={styles.eyebrow}>Alignment workbench · Text preview</p>
                    <h1>把教学计划对齐到课程标准</h1>
                    <p>解析、复核、匹配、确认、覆盖分析。机器只提出候选；教师决定什么真正进入计划。</p>
                </div>
            </header>
            <main className={`${styles.workspace} container`}>
                <nav className={styles.steps} aria-label="工作台步骤">
                    {['1 导入计划', '2 复核结构', '3 审核候选', '4 分析覆盖'].map((label, index) => <span key={label} data-active={index === (coverage ? 3 : matches ? 2 : plan ? 1 : 0)}>{label}</span>)}
                </nav>
                {error ? <p className={styles.error} role="alert">{error}</p> : null}
                {status ? <p className={styles.status} role="status">{status}</p> : null}

                <section className={styles.panel} aria-labelledby="plan-input-title">
                    <div className={styles.panelHead}><div><p className={styles.eyebrow}>01 / 输入</p><h2 id="plan-input-title">教学计划文本</h2></div><button type="button" onClick={parse} disabled={!text.trim()}>解析计划</button></div>
                    <textarea value={text} onChange={event => setText(event.target.value)} rows={9} aria-label="教学计划文本" />
                    <p className={styles.privacy}>当前版本只在请求期间处理纯文本，不上传文件、不创建账户、不持久化教学计划。</p>
                </section>

                {plan ? <section className={styles.panel} aria-labelledby="plan-review-title">
                    <div className={styles.panelHead}><div><p className={styles.eyebrow}>02 / 人工复核</p><h2 id="plan-review-title">结构化计划</h2></div><button type="button" onClick={match}>查找候选标准</button></div>
                    <div className={styles.formGrid}>
                        <label>计划标题<input value={plan.title || ''} onChange={event => updatePlan('title', event.target.value)} /></label>
                        <label>学科<select value={plan.subject_slug || ''} onChange={event => updatePlan('subject_slug', event.target.value)}><option value="">请选择</option>{SUBJECTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label>年级<input value={plan.grade || ''} onChange={event => updatePlan('grade', event.target.value)} /></label>
                        <label>学段编码<input value={plan.grade_band || ''} onChange={event => updatePlan('grade_band', event.target.value)} placeholder="例如 H2" /></label>
                    </div>
                    <div className={styles.units}>{plan.units.map((unit, index) => <fieldset key={unit.unit_id || index}><legend>{unit.unit_id || `U${index + 1}`}</legend><label>单元名称<input value={unit.title || ''} onChange={event => updateUnit(index, 'title', event.target.value)} /></label><label>学习目标（每行一条）<textarea rows={4} value={(unit.learning_goals || []).join('\n')} onChange={event => updateUnit(index, 'learning_goals', event.target.value)} /></label></fieldset>)}</div>
                </section> : null}

                {matches ? <section className={styles.panel} aria-labelledby="candidate-title">
                    <div className={styles.panelHead}><div><p className={styles.eyebrow}>03 / 教师审核</p><h2 id="candidate-title">候选标准</h2></div><button type="button" onClick={analyze}>分析已确认覆盖</button></div>
                    {matches.units.map(unit => <div className={styles.matchUnit} key={unit.unit_id}><h3>{unit.unit_title}</h3><div className={styles.candidates}>{unit.matches.map(match => {
                        const decision = decisions[`${unit.unit_id}::${match.code}`]
                        return <article key={match.code} data-decision={decision || 'unreviewed'}><div><span>{match.code}</span><span>{Math.round(match.score * 100)} 检索分</span><span>{decision === 'accepted' ? '已接受' : decision === 'rejected' ? '已拒绝' : '待复核'}</span></div><h4><Link to={`/standards/${match.code}`}>{match.standard.standard_title || match.standard.standard}</Link></h4><p>{match.rationale}</p><div className={styles.decisionButtons}><button type="button" onClick={() => decide(unit.unit_id, match.code, 'accepted')} aria-pressed={decision === 'accepted'}>接受</button><button type="button" onClick={() => decide(unit.unit_id, match.code, 'rejected')} aria-pressed={decision === 'rejected'}>拒绝</button></div></article>
                    })}</div></div>)}
                </section> : null}

                {coverage ? <section className={styles.panel} aria-labelledby="coverage-title">
                    <div className={styles.panelHead}><div><p className={styles.eyebrow}>04 / 覆盖</p><h2 id="coverage-title">教师确认后的覆盖</h2></div><button type="button" onClick={saveAccepted} disabled={!acceptedCodes.length}>加入我的清单</button></div>
                    <div className={styles.metrics}><div><strong>{coverage.covered_standard_codes.length}</strong><span>已确认标准</span></div><div><strong>{coverage.unreviewed_standard_codes.length}</strong><span>未复核候选</span></div><div><strong>{coverage.rejected_standard_codes.length}</strong><span>已拒绝候选</span></div></div>
                    <p className={styles.privacy}>只有“已接受”会计入覆盖。“缺口”需要明确参考范围，本次未提供，因此系统不会制造缺口结论。</p>
                </section> : null}
            </main>
        </div>
    )
}

export default AlignmentWorkbenchPage
