import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Routes, Route, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import Header from './components/Header'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import LegacyStandardRedirect from './pages/LegacyStandardRedirect'
import { isV2Code, migrateSavedCodes } from './data/v2Data.js'
import { getCollections, saveCollections } from './data/collections'
import NotFoundPage from './pages/NotFoundPage'
import RouteUiBoundary from './components/RouteUiBoundary'
import { PageLoading } from './components/StateComponents'
import { DefaultPageMeta } from './seo/usePageMeta.js'
import UiTelemetryListener from './observability/UiTelemetryListener'
import UmamiRouteTelemetry from './observability/UmamiRouteTelemetry'
import { isKebiaoProductionHost } from './observability/umamiTelemetry.js'
import { SkyProvider } from './features/starmap/SkyProvider.jsx'
import './App.css'

const SubjectPage = lazy(() => import('./pages/SubjectPage'))
// the standard page, the comparison and the skills pages load on demand: the first visit gets the prerendered
// page at once (PageLoading shows it), and every other page no longer downloads their code and react-aria
const StandardV2Page = lazy(() => import('./pages/StandardV2Page'))
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'))
const SkillsOverviewPage = lazy(() => import('./pages/SkillsOverviewPage'))
const SkillDetailPage = lazy(() => import('./pages/SkillDetailPage'))
const StandardDetailPage = lazy(() => import('./pages/StandardDetailPage'))
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'))
const GlossaryPage = lazy(() => import('./pages/GlossaryPage'))
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'))
const ApiPage = lazy(() => import('./pages/ApiPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const CollectionDetailPage = lazy(() => import('./pages/CollectionDetailPage'))
const PrintPage = lazy(() => import('./pages/PrintPage'))
const StyleGuidePage = lazy(() => import('./pages/StyleGuidePage'))
const SmartSearchPage = lazy(() => import('./pages/SmartSearchPage'))
const TextbookLibraryPage = lazy(() => import('./pages/TextbookLibraryPage'))
const TextbookDetailPage = lazy(() => import('./pages/TextbookDetailPage'))
const TextbookReaderPage = lazy(() => import('./pages/TextbookReaderPage'))
const TextbookResourceReaderPage = lazy(() => import('./pages/TextbookResourceReaderPage'))
const TextbookUnitPage = lazy(() => import('./pages/TextbookUnitPage'))
const TextbookAlignmentPage = lazy(() => import('./pages/TextbookAlignmentPage'))
const LearningResourceLibraryPage = lazy(() => import('./pages/LearningResourceLibraryPage'))
const LearningResourceDetailPage = lazy(() => import('./pages/LearningResourceDetailPage'))
const ConceptsPage = lazy(() => import('./pages/ConceptsPage'))
const ConceptDetailPage = lazy(() => import('./pages/ConceptDetailPage'))
const SubjectSkeletonPage = lazy(() => import('./pages/SubjectSkeletonPage'))
const LessonPlanPage = lazy(() => import('./pages/LessonPlanPage'))
const InterdisciplinaryPage = lazy(() => import('./pages/InterdisciplinaryPage'))
const ExperimentsPage = lazy(() => import('./pages/ExperimentsPage'))
const TeacherExamPage = lazy(() => import('./pages/TeacherExamPage'))
const KnowledgeGraphPage = lazy(() => import('./pages/KnowledgeGraphPage'))
const GuidePage = lazy(() => import('./pages/GuidePage'))
const AiConnectPage = lazy(() => import('./pages/AiConnectPage'))
const StandardsHubPage = lazy(() => import('./pages/StandardsHubPage'))
const ChecksPage = lazy(() => import('./pages/ChecksPage'))
const ChecksAfterPage = lazy(() => import('./pages/ChecksAfterPage'))
const ChecksPresentPage = lazy(() => import('./pages/ChecksPresentPage'))

// v2 codes (MA-S1-NA-01, MA-S1-NA-01.3) open the standard; old codes move to where their record now lives.
function StandardRoute() {
    const { code } = useParams()
    return isV2Code(code) ? lazyPage(<StandardV2Page />, '正在打开标准') : <LegacyStandardRedirect code={code} />
}

// /search compares subjects and 学段; a keyword (/search?q=分数, as people and other sites guess it) goes to the AI search
function SearchRoute() {
    const [params] = useSearchParams()
    const keyword = (params.get('q') || '').trim()
    if (keyword && !params.get('subjects') && !params.get('bands')) return <Navigate to={`/smart-search?q=${encodeURIComponent(keyword)}`} replace />
    return lazyPage(<SearchResultsPage />, '正在打开对比视图')
}

// 中考复习地图 (/review) became the 知识图谱: /review?subject=physics opens 物理 (vercel.json redirects the same way)
const GRAPH_SLUGS = ['chinese', 'math', 'english', 'morality_law', 'history', 'geography', 'science', 'physics', 'chemistry', 'biology', 'it', 'pe', 'arts', 'labor']
function ReviewRedirect() {
    const [params] = useSearchParams()
    const subject = params.get('subject') || ''
    return <Navigate to={GRAPH_SLUGS.includes(subject) ? `/knowledge-graph/${subject}` : '/knowledge-graph'} replace />
}

// 学期进度表 (/schedule) is gone: an old link opens its book (vercel.json redirects the same way for full page loads)
function ScheduleRedirect() {
    const [params] = useSearchParams()
    const edition = params.get('edition') || ''
    return <Navigate to={/^ed_[0-9a-f]+$/u.test(edition) ? `/textbooks/${edition}` : '/textbooks'} replace />
}

function lazyPage(element, message) {
    return <Suspense fallback={<PageLoading message={message} />}>{element}</Suspense>
}

function App() {
    const route = (routeKey, element) => <RouteUiBoundary routeKey={routeKey}>{element}</RouteUiBoundary>
    const analyticsEnabled = import.meta.env.VITE_ENABLE_ANALYTICS === 'true'
    const speedInsightsEnabled = import.meta.env.VITE_ENABLE_SPEED_INSIGHTS === 'true'
    const umamiEnabled = isKebiaoProductionHost()
    // the projector view fills the screen: no site header or footer around it
    const bare = useLocation().pathname.startsWith('/checks/present')
    // saved lists made before the 2025 rebuild hold old codes; move them to the new standards
    useEffect(() => { migrateSavedCodes({ getCollections, saveCollections }).catch(() => {}) }, [])

    return (
        <SkyProvider>
        <div className="app">
            {/* the projector view starts in its slides; the hidden skip link's shadow would show in the corner */}
            {bare ? null : <a className="skip-link" href="#main-content">跳到主要内容</a>}
            {bare ? null : <Header />}
            <main className="main-content" id="main-content">
                <DefaultPageMeta />
                <Routes>
                    <Route path="/" element={route('home', <HomePage />)} />
                    <Route path="/subjects/:slug" element={route('subject', lazyPage(<SubjectPage />, '正在展开学科星图'))} />
                    <Route path="/skills" element={route('skills', lazyPage(<SkillsOverviewPage />, '正在打开可迁移技能'))} />
                    <Route path="/skills/:code" element={route('skillDetail', lazyPage(<SkillDetailPage />, '正在打开技能'))} />
                    <Route path="/search" element={route('search', <SearchRoute />)} />
                    <Route path="/textbooks" element={route('textbooks', lazyPage(<TextbookLibraryPage />, '正在打开教材馆'))} />
                    <Route path="/learning-resources" element={route('learningResources', lazyPage(<LearningResourceLibraryPage />, '正在打开学习资源库'))} />
                    <Route path="/learning-resources/:resourceId" element={route('learningResourceDetail', lazyPage(<LearningResourceDetailPage />, '正在打开学习资源'))} />
                    <Route path="/textbooks/:editionId/read" element={route('textbookReader', lazyPage(<TextbookReaderPage />, '正在打开教材阅读器'))} />
                    <Route path="/textbooks/:editionId/standards" element={route('textbookAlignment', lazyPage(<TextbookAlignmentPage />, '正在整理课标对应表'))} />
                    <Route path="/textbook-alignment" element={<Navigate to="/textbooks" replace />} />
                    <Route path="/textbooks/:editionId" element={route('textbookDetail', lazyPage(<TextbookDetailPage />, '正在打开教材详情'))} />
                    <Route path="/textbook-resources/:resourceId/read" element={route('textbookResourceReader', lazyPage(<TextbookResourceReaderPage />, '正在打开支持资源阅读器'))} />
                    <Route path="/textbook-units/:unitId" element={route('textbookUnit', lazyPage(<TextbookUnitPage />, '正在整理教材单元'))} />
                    <Route path="/smart-search" element={route('smartSearch', lazyPage(<SmartSearchPage />, '正在打开智能检索'))} />
                    {/* 课程对齐工作台 merged into 目标体检 (AI 备课 step 2) */}
                    <Route path="/alignment-workbench" element={<Navigate to="/lesson-plan?check=1" replace />} />
                    <Route path="/glossary" element={route('glossary', lazyPage(<GlossaryPage />, '正在打开术语表'))} />
                    <Route path="/lesson-plan" element={route('lessonPlan', lazyPage(<LessonPlanPage />, '正在打开 AI 备课'))} />
                    <Route path="/guide" element={route('guide', lazyPage(<GuidePage />, '正在打开上手指南'))} />
                    <Route path="/ai" element={route('ai', lazyPage(<AiConnectPage />, '正在打开在 AI 里用 kebiao'))} />
                    <Route path="/checks" element={route('checks', lazyPage(<ChecksPage />, '正在打开课堂诊断'))} />
                    <Route path="/checks/after" element={route('checksAfter', lazyPage(<ChecksAfterPage />, '正在打开批完就用'))} />
                    <Route path="/checks/present" element={route('checksPresent', lazyPage(<ChecksPresentPage />, '正在准备放映'))} />
                    <Route path="/knowledge-graph" element={route('knowledgeGraph', lazyPage(<KnowledgeGraphPage />, '正在展开知识图谱'))} />
                    <Route path="/knowledge-graph/:slug" element={route('knowledgeGraph', lazyPage(<KnowledgeGraphPage />, '正在展开知识图谱'))} />
                    <Route path="/review" element={<ReviewRedirect />} />
                    <Route path="/schedule" element={<ScheduleRedirect />} />
                    <Route path="/teacher-exam" element={route('teacherExam', lazyPage(<TeacherExamPage />, '正在打开教资课标速记'))} />
                    <Route path="/experiments" element={route('experiments', lazyPage(<ExperimentsPage />, '正在打开必做实验清单'))} />
                    <Route path="/interdisciplinary" element={route('interdisciplinary', lazyPage(<InterdisciplinaryPage />, '正在打开跨学科主题库'))} />
                    <Route path="/concepts" element={route('concepts', lazyPage(<ConceptsPage />, '正在打开概念词典'))} />
                    <Route path="/concepts/subjects/:slug" element={route('subjectSkeleton', lazyPage(<SubjectSkeletonPage />, '正在整理学科骨架'))} />
                    <Route path="/concepts/:termId" element={route('concept', lazyPage(<ConceptDetailPage />, '正在打开概念'))} />
                    <Route path="/standards" element={route('standardsHub', lazyPage(<StandardsHubPage />, '正在打开课标'))} />
                    <Route path="/standards/:code" element={route('standard', <StandardRoute />)} />
                    <Route path="/standards/:code/v1" element={route('standard', lazyPage(<StandardDetailPage />, '正在打开旧条目'))} />
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
                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </main>
            {bare ? null : <Footer />}
            {analyticsEnabled ? <Analytics /> : null}
            {analyticsEnabled || umamiEnabled ? <UiTelemetryListener /> : null}
            {umamiEnabled ? <UmamiRouteTelemetry /> : null}
            {speedInsightsEnabled ? <SpeedInsights /> : null}
        </div>
        </SkyProvider>
    )
}

export default App
