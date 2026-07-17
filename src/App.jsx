import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import Header from './components/Header'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import SubjectPage from './pages/SubjectPage'
import SkillsOverviewPage from './pages/SkillsOverviewPage'
import SkillDetailPage from './pages/SkillDetailPage'
import SearchResultsPage from './pages/SearchResultsPage'
import StandardDetailPage from './pages/StandardDetailPage'
import RouteUiBoundary from './components/RouteUiBoundary'
import { LoadingState } from './components/StateComponents'
import UiTelemetryListener from './observability/UiTelemetryListener'
import UmamiRouteTelemetry from './observability/UmamiRouteTelemetry'
import { isKebiaoProductionHost } from './observability/umamiTelemetry.js'
import './App.css'

const CollectionsPage = lazy(() => import('./pages/CollectionsPage'))
const GlossaryPage = lazy(() => import('./pages/GlossaryPage'))
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'))
const ApiPage = lazy(() => import('./pages/ApiPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const CollectionDetailPage = lazy(() => import('./pages/CollectionDetailPage'))
const PrintPage = lazy(() => import('./pages/PrintPage'))
const StyleGuidePage = lazy(() => import('./pages/StyleGuidePage'))
const SmartSearchPage = lazy(() => import('./pages/SmartSearchPage'))
const AlignmentWorkbenchPage = lazy(() => import('./pages/AlignmentWorkbenchPage'))
const TextbookLibraryPage = lazy(() => import('./pages/TextbookLibraryPage'))
const TextbookDetailPage = lazy(() => import('./pages/TextbookDetailPage'))
const TextbookReaderPage = lazy(() => import('./pages/TextbookReaderPage'))
const TextbookUnitPage = lazy(() => import('./pages/TextbookUnitPage'))

function lazyPage(element, message) {
    return <Suspense fallback={<LoadingState message={message} />}>{element}</Suspense>
}

function App() {
    const route = (routeKey, element) => <RouteUiBoundary routeKey={routeKey}>{element}</RouteUiBoundary>
    const analyticsEnabled = import.meta.env.VITE_ENABLE_ANALYTICS === 'true'
    const speedInsightsEnabled = import.meta.env.VITE_ENABLE_SPEED_INSIGHTS === 'true'
    const umamiEnabled = isKebiaoProductionHost()

    return (
        <div className="app">
            <a className="skip-link" href="#main-content">跳到主要内容</a>
            <Header />
            <main className="main-content" id="main-content">
                <Routes>
                    <Route path="/" element={route('home', <HomePage />)} />
                    <Route path="/subjects/:slug" element={route('subject', <SubjectPage />)} />
                    <Route path="/skills" element={route('skills', <SkillsOverviewPage />)} />
                    <Route path="/skills/:code" element={route('skillDetail', <SkillDetailPage />)} />
                    <Route path="/search" element={route('search', <SearchResultsPage />)} />
                    <Route path="/textbooks" element={route('textbooks', lazyPage(<TextbookLibraryPage />, '正在打开教材馆'))} />
                    <Route path="/textbooks/:editionId/read" element={route('textbookReader', lazyPage(<TextbookReaderPage />, '正在打开教材阅读器'))} />
                    <Route path="/textbooks/:editionId" element={route('textbookDetail', lazyPage(<TextbookDetailPage />, '正在打开教材详情'))} />
                    <Route path="/textbook-units/:unitId" element={route('textbookUnit', lazyPage(<TextbookUnitPage />, '正在整理教材单元'))} />
                    <Route path="/smart-search" element={route('smartSearch', lazyPage(<SmartSearchPage />, '正在打开智能检索'))} />
                    <Route path="/alignment-workbench" element={route('alignmentWorkbench', lazyPage(<AlignmentWorkbenchPage />, '正在打开对齐工作台'))} />
                    <Route path="/glossary" element={route('glossary', lazyPage(<GlossaryPage />, '正在打开术语表'))} />
                    <Route path="/standards/:code" element={route('standard', <StandardDetailPage />)} />
                    <Route
                        path="/collections"
                        element={route('collections', lazyPage(<CollectionsPage />, '正在打开清单'))}
                    />
                    <Route path="/collections/:id" element={route('collectionDetail', lazyPage(<CollectionDetailPage />, '正在打开清单详情'))} />
                    <Route path="/print" element={route('print', lazyPage(<PrintPage />, '正在准备打印预览'))} />
                    <Route path="/styleguide" element={route('styleguide', lazyPage(<StyleGuidePage />, '正在打开设计系统'))} />
                    <Route path="/feedback" element={route('feedback', lazyPage(<FeedbackPage />, '正在打开反馈表单'))} />
                    <Route path="/api" element={route('api', lazyPage(<ApiPage />, '正在打开 API 页面'))} />
                    <Route path="/contact" element={route('contact', lazyPage(<ContactPage />, '正在打开联系页面'))} />
                </Routes>
            </main>
            <Footer />
            {analyticsEnabled ? <Analytics /> : null}
            {analyticsEnabled || umamiEnabled ? <UiTelemetryListener /> : null}
            {umamiEnabled ? <UmamiRouteTelemetry /> : null}
            {speedInsightsEnabled ? <SpeedInsights /> : null}
        </div>
    )
}

export default App
