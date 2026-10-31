import { Link } from 'react-router-dom'
import KebiaoLogo from './KebiaoLogo.jsx'
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

    return (
        <footer className={styles.root} data-kb-shell="footer">
            {/* Upper: Content Columns */}
            <div className={styles.upper}>
                <div className={`container ${styles.grid}`}>
                    {/* Column 1: Brand & Description */}
                    <div className={`${styles.column} ${styles.brand}`}>
                        <div className={styles.logo} role="img" aria-label="kebiao 课标">
                            <KebiaoLogo className={styles.mark} />
                        </div>
                        <p className={styles.tagline}>
                            中国课程标准的结构化索引与智能引擎
                        </p>
                    </div>

                    {/* Column 2: Quick Links */}
                    <div className={styles.column}>
                        <h4 className={styles.heading}>快速入口</h4>
                        <ul className={styles.links}>
                            <li><Link to="/textbooks">选教材</Link></li>
                            <li><Link to="/standards">按学科看课标</Link></li>
                            <li><Link to="/search">对比筛选</Link></li>
                            <li><Link to="/guide">上手指南</Link></li>
                            <li><Link to="/collections">我的清单</Link></li>
                            <li><Link to="/api">开发者 API</Link></li>
                        </ul>
                    </div>

                    {/* Column 3: Data Statement */}
                    <div className={styles.column}>
                        <h4 className={styles.heading}>数据说明</h4>
                        <p className={styles.text}>
                            数据来源：义务教育课程标准（2022年版2025年修订）
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
                            <li><Link to="/contact">联系我们</Link></li>
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
