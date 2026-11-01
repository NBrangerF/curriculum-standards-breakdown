import { columnLabel, pointNumber } from './graphData'
import styles from './KnowledgeGraph.module.css'

/** The map as text: each thread, its stations in grade order, every 要点 with the lessons that teach it. */
export default function GraphList({ graph, onPick }) {
    const keys = [...graph.columns.map(column => column.key), 'shared']
    return (
        <div className={styles.list}>
            {graph.lanes.map(lane => (
                <section key={lane.id} className={styles.listLane} aria-label={lane.name}>
                    <h3>{lane.name}{lane.group ? <small>{lane.group}</small> : null}</h3>
                    {keys.flatMap(key => [
                        ...(lane.roots?.[key] || []).map(std => [key, std, true]),
                        ...(lane.cells[key] || []).map(std => [key, std, false])
                    ]).map(([key, std, root]) => {
                        const info = graph.standards[std]
                        const codes = info.points.filter(code => (graph.points[code]?.col ?? graph.external[code]?.col) === key)
                        if (!codes.length) return null
                        return (
                            <div key={`${key}-${std}`} className={styles.listStation}>
                                <h4><span>{root ? `小学科学 · ${graph.external[codes[0]]?.colLabel || ''}` : columnLabel(graph, key)}</span>{info.title}</h4>
                                <ul>
                                    {codes.map(code => {
                                        const point = graph.points[code] || { t: graph.external[code]?.t, tags: [] }
                                        return (
                                            <li key={code}>
                                                <button type="button" onClick={() => onPick(code, root ? 'science' : graph.slug)}>
                                                    <code>{root ? code : pointNumber(code)}</code>
                                                    <span>
                                                        {point.t}
                                                        {point.tags?.length ? <span className={styles.listTags}>教材：{point.tags.join('；')}</span> : null}
                                                    </span>
                                                </button>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        )
                    })}
                </section>
            ))}
        </div>
    )
}
