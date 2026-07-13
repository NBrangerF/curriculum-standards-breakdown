import { useEffect, useState } from 'react'
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import { m } from 'motion/react'
import styles from './TaxonomyColumnNavigator.module.css'

const labelFor = item => item.type === 'knowledge_point' ? '知识点' : '分类'

export default function TaxonomyColumnNavigator({ controller, snapshot, onSelect }) {
    const initialPath = snapshot.context.taxonomy.activePath.map(item => item.id)
    const initialPathKey = initialPath.join('|')
    const [trail, setTrail] = useState(initialPath)
    useEffect(() => setTrail(initialPath), [initialPathKey])
    const columns = controller.getTaxonomyColumns(trail)

    const selectItem = (item, columnIndex) => {
        if (item.type === 'knowledge_point') {
            onSelect(item.id, [...trail.slice(0, columnIndex), item.id])
            return
        }
        setTrail([...trail.slice(0, columnIndex), item.id])
    }

    return (
        <section className={styles.navigator} aria-labelledby="taxonomy-navigator-title">
            <div className={styles.navigatorHeading}>
                <span>分类导航</span>
                <h2 id="taxonomy-navigator-title">持续定位</h2>
            </div>
            <div className={styles.columns} role="group" aria-label="Miller Columns 分类导航">
                {columns.map((column, columnIndex) => (
                    <m.div className={styles.column} key={column.id} layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
                        <ul>
                            {column.items.map(item => {
                                const selected = trail[columnIndex] === item.id
                                return (
                                    <li key={item.id}>
                                        <button type="button" className={selected ? styles.selected : ''} aria-current={item.id === snapshot.selectedNodeId ? 'page' : undefined} onClick={() => selectItem(item, columnIndex)}>
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
