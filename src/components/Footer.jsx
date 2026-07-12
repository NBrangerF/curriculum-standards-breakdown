import { Link, useNavigate, useLocation } from 'react-router-dom'
import styles from './Footer.module.css'

/**
 * Footer - Comprehensive site footer
 * 
 * Structure:
 * - Upper: 4-column content (brand, navigation, data, feedback)
 * - Lower: Copyright bar
 */
function Footer() {
    const currentYear = new Date().getFullYear()
    const navigate = useNavigate()
    const location = useLocation()

    // Handle subjects link - navigate to home then scroll
    const handleSubjectsClick = (e) => {
        e.preventDefault()
        if (location.pathname === '/') {
            // Already on home, just scroll
            const target = document.getElementById('subjects-section')
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' })
            }
        } else {
            // Navigate to home first, then scroll after load
            navigate('/')
            setTimeout(() => {
                const target = document.getElementById('subjects-section')
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' })
                }
            }, 100)
        }
    }

    return (
        <footer className={styles.root} data-kb-shell="footer">
            {/* Upper: Content Columns */}
            <div className={styles.upper}>
                <div className={`container ${styles.grid}`}>
                    {/* Column 1: Brand & Description */}
                    <div className={`${styles.column} ${styles.brand}`}>
                        <div className={styles.logo}>
                            <span className={styles.coordinate} aria-hidden="true"></span>
                            <span className={styles.logoText}>kebiao</span>
                        </div>
                        <p className={styles.tagline}>
                            中国课程标准的结构化索引与智能引擎
                        </p>
                    </div>

                    {/* Column 2: Quick Links */}
                    <div className={styles.column}>
                        <h4 className={styles.heading}>快速入口</h4>
                        <ul className={styles.links}>
                            <li><a href="/#subjects-section" onClick={handleSubjectsClick}>按学科浏览</a></li>
                            <li><Link to="/skills">按可迁移能力浏览</Link></li>
                            <li><Link to="/search">对比筛选</Link></li>
                            <li><Link to="/collections">我的清单</Link></li>
                        </ul>
                    </div>

                    {/* Column 3: Data Statement */}
                    <div className={styles.column}>
                        <h4 className={styles.heading}>数据说明</h4>
                        <p className={styles.text}>
                            数据来源：义务教育课程标准（2022年版）
                        </p>
                        <p className={`${styles.text} ${styles.disclaimer}`}>
                            本网站为结构化整理与检索工具，仅供教学与研究参考。请以官方发布文本为准。
                        </p>
                    </div>

                    {/* Column 4: Feedback & Support */}
                    <div className={styles.column}>
                        <h4 className={styles.heading}>反馈与支持</h4>
                        <ul className={styles.links}>
                            <li><Link to="/feedback">反馈与纠错</Link></li>
                            <li><Link to="/feedback">提交建议</Link></li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Lower: Copyright Bar */}
            <div className={styles.lower}>
                <div className={`container ${styles.bottom}`}>
                    <span className={styles.copyright}>
                        © {currentYear} kebiao
                    </span>
                    <span className={styles.legal}>
                        数据仅供教学研究参考 · 以官方发布为准
                    </span>
                </div>
            </div>
        </footer>
    )
}

export default Footer
