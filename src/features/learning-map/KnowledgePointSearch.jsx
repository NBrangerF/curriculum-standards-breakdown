import { useDeferredValue, useMemo, useState } from 'react'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import styles from './TaxonomyColumnNavigator.module.css'

export default function KnowledgePointSearch({ controller, onSelect }) {
    const [query, setQuery] = useState('')
    const deferredQuery = useDeferredValue(query)
    const results = useMemo(() => controller.search(deferredQuery), [controller, deferredQuery])

    return (
        <section className={styles.search} aria-label="搜索知识点">
            <label>
                <MagnifyingGlassIcon aria-hidden="true" size={15} />
                <span className="sr-only">搜索知识点</span>
                <input value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="搜索知识点或标准编码" />
            </label>
            {query.trim() ? (
                <ul className={styles.results}>
                    {results.length ? results.map(({ point, taxonomyPath, relationshipCount }) => (
                        <li key={point.id}>
                            <button type="button" onClick={() => { setQuery(''); onSelect(point.id, taxonomyPath.map(item => item.id)) }}>
                                <strong>{point.label}</strong>
                                <span>{taxonomyPath.map(item => item.label).join(' / ') || point.subjectSlug} · {relationshipCount} 条已验证关系</span>
                            </button>
                        </li>
                    )) : <li className={styles.noResults}>没有匹配的已审核知识点。</li>}
                </ul>
            ) : null}
        </section>
    )
}
