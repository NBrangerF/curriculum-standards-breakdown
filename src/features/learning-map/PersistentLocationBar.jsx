import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import styles from './LearningMapWorkspace.module.css'

export default function PersistentLocationBar({ context, onSwitchContext }) {
    const path = context.taxonomy.activePath || []
    const alternatives = context.taxonomy.alternativePaths || []
    return (
        <header className={styles.locationBar} aria-label="当前学习位置">
            <div className={styles.locationTitle}>
                <span>学习脉络</span>
                <strong>先掌握什么 · 接下来解锁什么</strong>
            </div>
            <nav className={styles.breadcrumb} aria-label="知识分类路径">
                {path.map((item, index) => (
                    <span key={item.id} className={index === path.length - 1 ? styles.currentCrumb : ''} aria-current={index === path.length - 1 ? 'page' : undefined}>
                        {index ? <CaretRightIcon aria-hidden="true" size={13} /> : null}
                        {item.label}
                    </span>
                ))}
            </nav>
            {alternatives.length ? (
                <button type="button" className={styles.contextButton} onClick={onSwitchContext}>
                    切换位置 <span>{alternatives.length + 1}</span>
                </button>
            ) : null}
        </header>
    )
}
