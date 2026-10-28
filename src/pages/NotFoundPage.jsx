import { Link } from 'react-router-dom'
import { PageHero } from '../components/kb'
import { useSky } from '../features/starmap/SkyProvider.jsx'

function NotFoundPage() {
    const { openPalette } = useSky()
    return (
        <div style={{ minHeight: '62vh' }}>
            <PageHero
                kicker="404 · 这颗星不在图上"
                title="页面不存在"
                lede="这个网址没有对应的页面，可能输入有误或页面已移动。"
                actions={<>
                    <Link to="/" className="btn btn-primary">返回首页</Link>
                    <button type="button" className="btn btn-secondary" onClick={() => openPalette()}>搜索课标 ⌘K</button>
                </>}
            />
        </div>
    )
}

export default NotFoundPage
