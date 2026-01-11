import { Routes, Route, Link } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import Header from './components/Header'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import SubjectPage from './pages/SubjectPage'
import SkillsOverviewPage from './pages/SkillsOverviewPage'
import SkillDetailPage from './pages/SkillDetailPage'
import SearchResultsPage from './pages/SearchResultsPage'
import GlossaryPage from './pages/GlossaryPage'
import StandardDetailPage from './pages/StandardDetailPage'
import CollectionsPage from './pages/CollectionsPage'
import CollectionDetailPage from './pages/CollectionDetailPage'
import PrintPage from './pages/PrintPage'
import StyleGuidePage from './pages/StyleGuidePage'
import FeedbackPage from './pages/FeedbackPage'
import './App.css'

function App() {
    return (
        <div className="app">
            <Header />
            <main className="main-content">
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/subjects/:slug" element={<SubjectPage />} />
                    <Route path="/skills" element={<SkillsOverviewPage />} />
                    <Route path="/skills/:code" element={<SkillDetailPage />} />
                    <Route path="/search" element={<SearchResultsPage />} />
                    <Route path="/glossary" element={<GlossaryPage />} />
                    <Route path="/standards/:code" element={<StandardDetailPage />} />
                    <Route path="/collections" element={<CollectionsPage />} />
                    <Route path="/collections/:id" element={<CollectionDetailPage />} />
                    <Route path="/print" element={<PrintPage />} />
                    <Route path="/styleguide" element={<StyleGuidePage />} />
                    <Route path="/feedback" element={<FeedbackPage />} />
                </Routes>
            </main>
            <Footer />
            <Analytics />
        </div>
    )
}

export default App


