import styles from './TextbookStatus.module.css'

const LABELS = {
    approved: '已定位',
    machine_checked: '自动定位',
    candidate: '待复核',
    unavailable: '待处理',
    native_text: '可搜索',
    partial_text: '部分可搜索',
    scan_only: '扫描版',
    unknown: '文字层待检查'
}

export default function TextbookStatus({ value, label }) {
    return <span className={`${styles.status} ${styles[value] || ''}`}>{label || LABELS[value] || value}</span>
}
