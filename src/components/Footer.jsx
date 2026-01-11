import { Link, useNavigate, useLocation } from 'react-router-dom'
import './Footer.css'

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
        <footer className="site-footer">
            {/* Upper: Content Columns */}
            <div className="footer-upper">
                <div className="container footer-grid">
                    {/* Column 1: Brand & Description */}
                    <div className="footer-column footer-brand">
                        <div className="footer-logo">
                            <span className="footer-logo-icon">🐋</span>
                            <span className="footer-logo-text">虎鲸课程标准</span>
                        </div>
                        <p className="footer-tagline">
                            义务教育课程标准（2022年版）结构化浏览与对比工具
                        </p>
                    </div>

                    {/* Column 2: Quick Links */}
                    <div className="footer-column">
                        <h4 className="footer-heading">快速入口</h4>
                        <ul className="footer-links">
                            <li><a href="/#subjects-section" onClick={handleSubjectsClick}>按学科浏览</a></li>
                            <li><Link to="/skills">按可迁移能力浏览</Link></li>
                            <li><Link to="/search">对比筛选</Link></li>
                            <li><Link to="/collections">我的清单</Link></li>
                        </ul>
                    </div>

                    {/* Column 3: Data Statement */}
                    <div className="footer-column">
                        <h4 className="footer-heading">数据说明</h4>
                        <p className="footer-text">
                            数据来源：义务教育课程标准（2022年版）
                        </p>
                        <p className="footer-text footer-disclaimer">
                            本网站为结构化整理与检索工具，仅供教学与研究参考。请以官方发布文本为准。
                        </p>
                    </div>

                    {/* Column 4: Feedback & Support */}
                    <div className="footer-column">
                        <h4 className="footer-heading">反馈与支持</h4>
                        <ul className="footer-links">
                            <li><Link to="/feedback">反馈与纠错</Link></li>
                            <li><Link to="/feedback">提交建议</Link></li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Lower: Copyright Bar */}
            <div className="footer-lower">
                <div className="container footer-bottom">
                    <span className="footer-copyright">
                        © {currentYear} 虎鲸课程标准
                    </span>
                    <span className="footer-legal">
                        数据仅供教学研究参考 · 以官方发布为准
                    </span>
                </div>
            </div>
        </footer>
    )
}

export default Footer

