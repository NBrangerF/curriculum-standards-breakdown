import styles from './TaxonomyColumnNavigator.module.css'

export default function TaxonomyContextSwitcher({ context, onSelectPath }) {
    const paths = [context.taxonomy.activePath, ...context.taxonomy.alternativePaths]
    if (paths.length < 2) return null
    return (
        <details className={styles.contextSwitcher}>
            <summary>切换位置 <span>{paths.length}</span></summary>
            <div>
                {paths.map(path => (
                    <button type="button" key={path.map(item => item.id).join('|')} onClick={() => onSelectPath(path.map(item => item.id))}>
                        {path.map(item => item.label).join(' / ')}
                    </button>
                ))}
            </div>
        </details>
    )
}
