import { Link } from 'react-router-dom'
import { ErrorState } from '../components/StateComponents'

function NotFoundPage() {
    return (
        <div className="page-content container">
            <ErrorState title="页面不存在" message="这个网址没有对应的页面，可能输入有误或页面已移动。" />
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <Link to="/" className="btn btn-primary">返回首页</Link>
            </div>
        </div>
    )
}

export default NotFoundPage
