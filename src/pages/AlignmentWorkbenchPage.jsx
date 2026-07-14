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

const PARSE_STATUS = {
    ok: 'AI 辅助提取已完成',
    disabled: '确定性解析（AI 未启用）',
    timeout: '确定性解析（AI 超时）',
    invalid_config: '确定性解析（模型配置不可用）',
    invalid_response: '确定性解析（模型结果未通过校验）',
    provider_error: '确定性解析（模型服务不可用）',
    skipped_length: '确定性解析（文本超过 AI 上限）',
    not_applicable: '结构化输入规范化'
}

function parseWeekList(value) {
    return [...new Set(value.split(/[\s,，;；]+/u).map(Number).filter(week => Number.isInteger(week) && week > 0))]
}

function evidenceLabel(path) {
    const labels = { title: '计划标题', subject_slug: '学科', grade: '年级', grade_band: '学段', duration_weeks: '教学周数', lessons_per_week: '每周课时' }
    return labels[path] || path.replace(/^units\.(\d+)\./u, (_match, index) => `单元 ${Number(index) + 1} · `)
}

function AlignmentWorkbenchPage() {
    const [text, setText] = useState(SAMPLE)
    const [plan, setPlan] = useState(null)
    const [matches, setMatches] = useState(null)
    const [decisions, setDecisions] = useState({})
    const [coverage, setCoverage] = useState(null)
    const [parseInfo, setParseInfo] = useState(null)
    const [fieldEvidence, setFieldEvidence] = useState([])
    const [schedule, setSchedule] = useState(null)
    const [scheduleOptions, setScheduleOptions] = useState({ teaching_weeks: '4', lessons_per_week: '2', review_weeks: '', exam_weeks: '' })
    const [referenceCodesText, setReferenceCodesText] = useState('')
    const [status, setStatus] = useState('')
    const [error, setError] = useState('')

    const decisionList = useMemo(() => Object.entries(decisions).map(([key, decision]) => {
        const [unit_id, code] = key.split('::')
        return { unit_id, code, decision }
    }), [decisions])
    const acceptedCodes = useMemo(() => decisionList.filter(item => item.decision === 'accepted').map(item => item.code), [decisionList])

    async function parse() {
        setStatus('正在解析计划…'); setError(''); setMatches(null); setCoverage(null); setSchedule(null); setDecisions({})
        try {
            const payload = await postApi('/api/v1/plans/parse', { text })
            setPlan(payload.data.plan)
            setParseInfo(payload.data.parse_interpretation || null)
            setFieldEvidence(payload.data.field_evidence || [])
            setScheduleOptions(previous => ({
                ...previous,
                teaching_weeks: String(payload.data.plan.duration_weeks || previous.teaching_weeks),
                lessons_per_week: String(payload.data.plan.lessons_per_week || previous.lessons_per_week)
            }))
            setStatus(payload.data.warnings?.join(' ') || '计划已解析，请先复核结构。')
        } catch (requestError) { setError(requestError.message); setStatus('') }
    }

    function invalidateMatches() {
        if (matches) setStatus('计划结构已修改，旧候选已失效；请重新查找候选标准。')
        setMatches(null)
        setDecisions({})
        setCoverage(null)
        setSchedule(null)
    }

    function updatePlan(field, value) {
        setPlan(previous => ({ ...previous, [field]: value }))
        invalidateMatches()
    }
    function updateUnit(index, field, value) {
        setPlan(previous => ({
            ...previous,
            units: previous.units.map((unit, unitIndex) => unitIndex === index
                ? { ...unit, [field]: field === 'learning_goals' ? value.split('\n').map(item => item.trim()).filter(Boolean) : value }
                : unit)
        }))
        invalidateMatches()
    }

    async function match() {
        if (!plan) return
        setStatus('正在检索候选标准…'); setError(''); setCoverage(null); setSchedule(null)
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
            const referenceScopeCodes = referenceCodesText.split(/[\s,，;；]+/u).map(code => code.trim()).filter(Boolean)
            const payload = await postApi('/api/v1/plans/analyze-coverage', {
                plan,
                top_k_per_unit: 5,
                review_decisions: decisionList,
                reference_scope_codes: referenceScopeCodes.length ? referenceScopeCodes : undefined
            })
            setCoverage(payload.data)
            setStatus(referenceScopeCodes.length
                ? '覆盖只统计已接受候选；缺口仅相对于你提供的参考标准范围计算。'
                : '覆盖只统计已接受候选；未设置参考标准范围，因此不会生成“缺口”结论。')
        } catch (requestError) { setError(requestError.message); setStatus('') }
    }

    function decide(unitId, code, decision) {
        setDecisions(previous => ({ ...previous, [`${unitId}::${code}`]: decision }))
        setCoverage(null)
        setSchedule(null)
    }

    async function generateSchedule() {
        if (!plan || !acceptedCodes.length) return
        setStatus('正在用已确认标准生成周计划…'); setError(''); setSchedule(null)
        try {
            const payload = await postApi('/api/v1/plans/generate-weekly-schedule', {
                plan,
                review_decisions: decisionList,
                teaching_weeks: Number(scheduleOptions.teaching_weeks),
                lessons_per_week: Number(scheduleOptions.lessons_per_week),
                review_weeks: parseWeekList(scheduleOptions.review_weeks),
                exam_weeks: parseWeekList(scheduleOptions.exam_weeks),
                top_k_per_unit: 5
            })
            setSchedule(payload.data)
            setStatus('周计划草案已生成。它只使用服务端重新验证后的教师接受标准，仍需复核课时、顺序与评价安排。')
        } catch (requestError) { setError(requestError.message); setStatus('') }
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
                    {['1 导入计划', '2 复核结构', '3 审核候选', '4 分析覆盖', '5 生成周计划'].map((label, index) => <span key={label} data-active={index === (schedule ? 4 : coverage ? 3 : matches ? 2 : plan ? 1 : 0)}>{label}</span>)}
                </nav>
                {error ? <p className={styles.error} role="alert">{error}</p> : null}
                {status ? <p className={styles.status} role="status">{status}</p> : null}

                <section className={styles.panel} aria-labelledby="plan-input-title">
                    <div className={styles.panelHead}><div><p className={styles.eyebrow}>01 / 输入</p><h2 id="plan-input-title">教学计划文本</h2></div><button type="button" onClick={parse} disabled={!text.trim()}>解析计划</button></div>
                    <textarea value={text} onChange={event => setText(event.target.value)} rows={9} aria-label="教学计划文本" />
                    <p className={styles.privacy}>当前版本只在请求期间处理纯文本，不上传文件、不创建账户、不持久化教学计划。可识别个人信息会在发送到模型服务前自动移除。</p>
                </section>

                {plan ? <section className={styles.panel} aria-labelledby="plan-review-title">
                    <div className={styles.panelHead}><div><p className={styles.eyebrow}>02 / 人工复核</p><h2 id="plan-review-title">结构化计划</h2></div><button type="button" onClick={match}>查找候选标准</button></div>
                    <div className={styles.trustSummary}>
                        <div><span>解析方式</span><strong>{PARSE_STATUS[parseInfo?.status] || '保守解析'}</strong></div>
                        <div><span>采用模型字段</span><strong>{parseInfo?.applied ? `${fieldEvidence.length} 条证据` : '0 · 使用规则结果'}</strong></div>
                        <div><span>隐私处理</span><strong>{parseInfo?.privacy?.redacted ? `已移除 ${parseInfo.privacy.redaction_count} 处` : '未发现可识别信息'}</strong></div>
                    </div>
                    {fieldEvidence.length ? <details className={styles.evidencePanel}><summary>查看 AI 字段证据（{fieldEvidence.length}）</summary><p>以下内容是未经教师复核的模型提取依据。可定位摘录来自脱敏后的输入；“推断”只允许用于学科、年级、学段和关键词。</p><div>{fieldEvidence.map((evidence, index) => <article key={`${evidence.path}-${index}`}><span>{evidenceLabel(evidence.path)}</span><span>{evidence.inferred ? '受限推断' : '原文定位'}</span><strong>{Math.round(evidence.confidence * 100)}%</strong><blockquote>{evidence.source_excerpt || '无逐字摘录（受限推断）'}</blockquote></article>)}</div></details> : <p className={styles.evidenceEmpty}>本次没有采用模型字段；下面是确定性解析结果。请逐项确认后再检索课标。</p>}
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
                    <label className={styles.referenceScope}>可选参考标准范围（用空格或逗号分隔 code）<textarea rows={2} value={referenceCodesText} onChange={event => { setReferenceCodesText(event.target.value); setCoverage(null) }} placeholder="例如 SC-D2-SC-010, SC-D2-PR-001；留空时不生成缺口结论" /><span>只有提供明确参照集合时，系统才会计算“未覆盖参考标准”。</span></label>
                    {matches.units.map(unit => <div className={styles.matchUnit} key={unit.unit_id}><h3>{unit.unit_title}</h3><div className={styles.candidates}>{unit.matches.map(match => {
                        const decision = decisions[`${unit.unit_id}::${match.code}`]
                        return <article key={match.code} data-decision={decision || 'unreviewed'}><div><span>{match.code}</span><span>{Math.round(match.score * 100)} 检索分</span><span>{decision === 'accepted' ? '已接受' : decision === 'rejected' ? '已拒绝' : '待复核'}</span></div><h4><Link to={`/standards/${match.code}`}>{match.standard.standard_title || match.standard.standard}</Link></h4><p>{match.rationale}</p><div className={styles.decisionButtons}><button type="button" onClick={() => decide(unit.unit_id, match.code, 'accepted')} aria-pressed={decision === 'accepted'}>接受</button><button type="button" onClick={() => decide(unit.unit_id, match.code, 'rejected')} aria-pressed={decision === 'rejected'}>拒绝</button></div></article>
                    })}</div></div>)}
                </section> : null}

                {coverage ? <section className={styles.panel} aria-labelledby="coverage-title">
                    <div className={styles.panelHead}><div><p className={styles.eyebrow}>04 / 覆盖</p><h2 id="coverage-title">教师确认后的覆盖</h2></div><button type="button" onClick={saveAccepted} disabled={!acceptedCodes.length}>加入我的清单</button></div>
                    <div className={styles.metrics}><div><strong>{coverage.covered_standard_codes.length}</strong><span>已确认标准</span></div><div><strong>{coverage.unreviewed_standard_codes.length}</strong><span>未复核候选</span></div><div><strong>{coverage.rejected_standard_codes.length}</strong><span>已拒绝候选</span></div><div><strong>{coverage.reference_scope_codes.length}</strong><span>参考范围</span></div><div><strong>{coverage.gap_standard_codes.length}</strong><span>参照范围内未覆盖</span></div></div>
                    <p className={styles.privacy}>只有“已接受”会计入覆盖；未提供参考范围时不会生成缺口结论。覆盖 API 会在当前数据版本上重新计算候选，不信任浏览器回传的匹配对象。</p>
                    {coverage.warnings?.map(warning => <p className={styles.coverageWarning} key={warning}>{warning}</p>)}
                </section> : null}

                {coverage ? <section className={styles.panel} aria-labelledby="schedule-builder-title">
                    <div className={styles.panelHead}><div><p className={styles.eyebrow}>05 / 可编辑草案</p><h2 id="schedule-builder-title">教师确认后的周计划</h2></div><button type="button" onClick={generateSchedule} disabled={!acceptedCodes.length}>生成周计划</button></div>
                    <p className={styles.sectionIntro}>系统会在服务器端重新计算候选，只把你明确接受且仍有效的标准放进周计划。AI 不决定标准，不自动发布计划。</p>
                    <div className={styles.scheduleControls}>
                        <label>教学周数<input type="number" min="1" max="60" value={scheduleOptions.teaching_weeks} onChange={event => { setScheduleOptions(previous => ({ ...previous, teaching_weeks: event.target.value })); setSchedule(null) }} /></label>
                        <label>每周课时<input type="number" min="1" max="20" value={scheduleOptions.lessons_per_week} onChange={event => { setScheduleOptions(previous => ({ ...previous, lessons_per_week: event.target.value })); setSchedule(null) }} /></label>
                        <label>复习周（逗号分隔）<input value={scheduleOptions.review_weeks} onChange={event => { setScheduleOptions(previous => ({ ...previous, review_weeks: event.target.value })); setSchedule(null) }} placeholder="例如 4, 8" /></label>
                        <label>评价周（逗号分隔）<input value={scheduleOptions.exam_weeks} onChange={event => { setScheduleOptions(previous => ({ ...previous, exam_weeks: event.target.value })); setSchedule(null) }} placeholder="例如 9" /></label>
                    </div>
                    <p className={styles.privacy}>当前已有 {new Set(acceptedCodes).size} 条教师接受标准。没有通过服务端复核的接受决定时，API 会拒绝生成。</p>
                </section> : null}

                {schedule ? <section className={styles.panel} aria-labelledby="schedule-result-title">
                    <div className={styles.panelHead}><div><p className={styles.eyebrow}>输出 / 仍需复核</p><h2 id="schedule-result-title">周计划草案</h2></div><span className={styles.reviewBadge}>需要教师复核</span></div>
                    <div className={styles.scheduleGrid}>{schedule.schedule.map(week => <article key={week.week} data-type={week.type}><div><span>第 {week.week} 周</span><span>{week.type === 'teaching' ? '教学' : week.type === 'review' ? '复习' : '评价'}</span></div><h3>{week.focus}</h3><p>{week.unit_title || '跨单元安排'} · {week.lesson_count} 课时</p><div className={styles.codeList}>{week.standard_codes.map(code => <Link key={code} to={`/standards/${code}`}>{code}</Link>)}</div>{week.assessment_focus ? <p>评价重点：{week.assessment_focus}</p> : null}{week.warnings?.map(warning => <small key={warning}>{warning}</small>)}</article>)}</div>
                    {schedule.warnings?.map(warning => <p className={styles.coverageWarning} key={warning}>{warning}</p>)}
                </section> : null}
            </main>
        </div>
    )
}

export default AlignmentWorkbenchPage
