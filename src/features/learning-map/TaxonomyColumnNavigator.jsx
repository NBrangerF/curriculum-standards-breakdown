import { useEffect, useRef, useState } from 'react'
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import { m } from 'motion/react'
import styles from './TaxonomyColumnNavigator.module.css'

const labelFor = item => item.type === 'knowledge_point' ? '知识点' : '分类'

export default function TaxonomyColumnNavigator({ controller, snapshot, onSelect }) {
    const initialPath = snapshot.context.taxonomy.activePath.map(item => item.id)
    const initialPathKey = initialPath.join('|')
    const [trail, setTrail] = useState(initialPath)
    const [rovingIds, setRovingIds] = useState({})
    const [pendingFocus, setPendingFocus] = useState()
    const buttonRefs = useRef(new Map())
    const columnsRef = useRef(null)
    useEffect(() => {
        setTrail(initialPath)
        setRovingIds(Object.fromEntries(initialPath.map((id, index) => [index, id])))
    }, [initialPathKey])
    const columns = controller.getTaxonomyColumns(trail)
    const columnsKey = columns.map(column => `${column.id}:${column.items.map(item => item.id).join(',')}`).join('|')

    useEffect(() => {
        if (!pendingFocus) return
        const item = columns[pendingFocus.columnIndex]?.items[pendingFocus.itemIndex]
        const button = item ? buttonRefs.current.get(`${pendingFocus.columnIndex}:${item.id}`) : undefined
        if (button) button.focus()
        setPendingFocus(undefined)
    }, [columnsKey, pendingFocus])

    useEffect(() => {
        const element = columnsRef.current
        if (element) element.scrollLeft = element.scrollWidth
    }, [columnsKey])

    const moveFocus = (columnIndex, itemIndex) => {
        const item = columns[columnIndex]?.items[itemIndex]
        if (!item) return
        setRovingIds(current => ({ ...current, [columnIndex]: item.id }))
        buttonRefs.current.get(`${columnIndex}:${item.id}`)?.focus()
    }

    const selectItem = (item, columnIndex) => {
        if (item.type === 'knowledge_point') {
            onSelect(item.id, [...trail.slice(0, columnIndex), item.id])
            return
        }
        setTrail([...trail.slice(0, columnIndex), item.id])
        setRovingIds(current => ({ ...current, [columnIndex]: item.id }))
    }

    const handleKeyDown = (event, item, columnIndex, itemIndex) => {
        const items = columns[columnIndex].items
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            moveFocus(columnIndex, Math.min(items.length - 1, itemIndex + 1))
            return
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveFocus(columnIndex, Math.max(0, itemIndex - 1))
            return
        }
        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            moveFocus(columnIndex, event.key === 'Home' ? 0 : items.length - 1)
            return
        }
        if (event.key === 'ArrowRight' && item.type !== 'knowledge_point') {
            event.preventDefault()
            setTrail([...trail.slice(0, columnIndex), item.id])
            setRovingIds(current => ({ ...current, [columnIndex]: item.id }))
            setPendingFocus({ columnIndex: columnIndex + 1, itemIndex: 0 })
            return
        }
        if (event.key === 'ArrowLeft' && columnIndex > 0) {
            event.preventDefault()
            const parentId = trail[columnIndex - 1]
            const parentIndex = columns[columnIndex - 1].items.findIndex(candidate => candidate.id === parentId)
            moveFocus(columnIndex - 1, Math.max(0, parentIndex))
        }
    }

    return (
        <section className={styles.navigator} aria-labelledby="taxonomy-navigator-title">
            <div className={styles.navigatorHeading}>
                <span>分类导航</span>
                <h2 id="taxonomy-navigator-title">持续定位</h2>
            </div>
            <p id="taxonomy-navigation-instructions" className="sr-only">使用上下方向键在当前分类列中移动，右方向键进入子级，左方向键返回父级。</p>
            <div ref={columnsRef} className={styles.columns} role="group" aria-label="Miller Columns 分类导航" aria-describedby="taxonomy-navigation-instructions">
                {columns.map((column, columnIndex) => (
                    <m.div className={styles.column} key={column.id} layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
                        <ul>
                            {column.items.map((item, itemIndex) => {
                                const selected = trail[columnIndex] === item.id
                                const rovingId = rovingIds[columnIndex] || trail[columnIndex] || column.items[0]?.id
                                return (
                                    <li key={item.id}>
                                        <button
                                            ref={button => {
                                                const key = `${columnIndex}:${item.id}`
                                                if (button) buttonRefs.current.set(key, button)
                                                else buttonRefs.current.delete(key)
                                            }}
                                            type="button"
                                            className={selected ? styles.selected : ''}
                                            aria-current={item.id === snapshot.selectedNodeId ? 'page' : undefined}
                                            tabIndex={rovingId === item.id ? 0 : -1}
                                            onFocus={() => setRovingIds(current => current[columnIndex] === item.id ? current : ({ ...current, [columnIndex]: item.id }))}
                                            onKeyDown={event => handleKeyDown(event, item, columnIndex, itemIndex)}
                                            onClick={() => selectItem(item, columnIndex)}
                                        >
                                            <span><small>{labelFor(item)}</small>{item.label}</span>
                                            {item.type !== 'knowledge_point' || item.descendantCount ? <CaretRightIcon aria-hidden="true" size={14} /> : null}
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    </m.div>
                ))}
            </div>
        </section>
    )
}
