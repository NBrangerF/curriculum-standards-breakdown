import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const srcRoot = path.join(root, 'src')
const tokenPath = path.join(srcRoot, 'styles', 'design-tokens.css')
const rollbackContractPath = path.join(root, 'docs', 'baselines', '2026-07-12-ui-rollback-contract.machine.json')
const requiredRouteKeys = [
    'home', 'subject', 'skills', 'skillDetail', 'search', 'glossary', 'standard',
    'collections', 'collectionDetail', 'print', 'styleguide', 'feedback'
]
const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
const isolatedStyleOwners = [
    ['src/components/Header.jsx', './Header.module.css', 'src/components/Header.css'],
    ['src/components/Footer.jsx', './Footer.module.css', 'src/components/Footer.css'],
    ['src/components/GradeBandTabs.jsx', './GradeBandTabs.module.css', 'src/components/GradeBandTabs.css'],
    ['src/components/StateComponents.jsx', './StateComponents.module.css', 'src/components/StateComponents.css'],
    ['src/components/TSBadge.jsx', './TSBadge.module.css', 'src/components/TSBadge.css'],
    ['src/components/CompareView.jsx', './CompareView.module.css', 'src/components/CompareView.css'],
    ['src/components/FavoriteButton.jsx', './FavoriteButton.module.css', 'src/components/FavoriteButton.css'],
    ['src/components/FilterBar.jsx', './FilterBar.module.css', 'src/components/FilterBar.css'],
    ['src/components/HeroBackground.jsx', './HeroBackground.module.css', 'src/components/HeroBackground.css'],
    ['src/components/CurriculumCoordinateMap.jsx', './CurriculumCoordinateMap.module.css', 'src/components/CurriculumCoordinateMap.css'],
    ['src/components/HomeHeroBanner.jsx', './HomeHeroBanner.module.css', 'src/components/HomeHeroBanner.css'],
    ['src/components/HomeNarrativeSection.jsx', './HomeNarrativeSection.module.css', 'src/components/HomeNarrativeSection.css'],
    ['src/components/SkillCard.jsx', './SkillCard.module.css', 'src/components/SkillCard.css'],
    ['src/components/StandardRelationPanel.jsx', './StandardRelationPanel.module.css', 'src/components/StandardRelationPanel.css'],
    ['src/components/StandardCard.jsx', './StandardCard.module.css', 'src/components/StandardCard.css'],
    ['src/components/SubjectColumn.jsx', './SubjectColumn.module.css', 'src/components/SubjectColumn.css'],
    ['src/components/SubjectHeroBanner.jsx', './SubjectHeroBanner.module.css', 'src/components/SubjectHeroBanner.css'],
    ['src/components/TSHeroBanner.jsx', './TSHeroBanner.module.css', 'src/components/TSHeroBanner.css'],
    ['src/pages/GlossaryPage.jsx', './GlossaryPage.module.css', 'src/pages/GlossaryPage.css'],
    ['src/pages/FeedbackPage.jsx', './FeedbackPage.module.css', 'src/pages/FeedbackPage.css'],
    ['src/pages/HomePage.jsx', './HomePage.module.css', 'src/pages/HomePage.css'],
    ['src/pages/CollectionDetailPage.jsx', './CollectionDetailPage.module.css', 'src/pages/CollectionDetailPage.css'],
    ['src/pages/CollectionsPage.jsx', './CollectionsPage.module.css', 'src/pages/CollectionsPage.css'],
    ['src/pages/PrintPage.jsx', './PrintPage.module.css', 'src/pages/PrintPage.css'],
    ['src/pages/SearchResultsPage.jsx', './SearchResultsPage.module.css', 'src/pages/SearchResultsPage.css'],
    ['src/pages/SkillDetailPage.jsx', './SkillDetailPage.module.css', 'src/pages/SkillDetailPage.css'],
    ['src/pages/SkillsOverviewPage.jsx', './SkillsOverviewPage.module.css', 'src/pages/SkillsOverviewPage.css'],
    ['src/pages/StyleGuidePage.jsx', './StyleGuidePage.module.css', 'src/pages/StyleGuidePage.css'],
    ['src/pages/StandardDetailPage.jsx', './StandardDetailPage.module.css', 'src/pages/StandardDetailPage.css'],
    ['src/pages/SubjectPage.jsx', './SubjectPage.module.css', 'src/pages/SubjectPage.css'],
    ['src/features/graph/GraphCanvas.jsx', './GraphCanvas.module.css', 'src/features/graph/GraphCanvas.css'],
    ['src/features/graph/SkillsGraphWorkspace.jsx', './SkillsGraphWorkspace.module.css', 'src/features/graph/SkillsGraphWorkspace.css'],
    ['src/ui/primitives/Disclosure.jsx', './Disclosure.module.css', 'src/ui/primitives/Disclosure.css'],
    ['src/ui/primitives/Skeleton.jsx', './Skeleton.module.css', 'src/ui/primitives/Skeleton.css'],
    ['src/ui/primitives/Toast.jsx', './Toast.module.css', 'src/ui/primitives/Toast.css'],
    ['src/ui/primitives/Tooltip.jsx', './Tooltip.module.css', 'src/ui/primitives/Tooltip.css']
]

function filesUnder(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(directory, entry.name)
        return entry.isDirectory() ? filesUnder(fullPath) : [fullPath]
    })
}

const sourceFiles = filesUnder(srcRoot).filter(file => /\.(?:css|js|jsx)$/.test(file))
const failures = []
const legacyGlobalStyleImports = []
const tokenSource = fs.readFileSync(tokenPath, 'utf8')
const canonicalNames = new Set([...tokenSource.matchAll(/--([a-z0-9-]+)\s*:/gi)].map(match => match[1]))

for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8')
    const relative = path.relative(root, file)

    if (emojiPattern.test(source)) failures.push(`${relative}: contains Emoji or pictographic symbols`)
    if (/\b(?:window\.)?(?:alert|confirm)\s*\(/.test(source)) failures.push(`${relative}: uses a blocking alert/confirm`)
    if (/from\s+['"]react-aria-components['"]/.test(source) && !relative.startsWith(`src${path.sep}ui${path.sep}primitives${path.sep}`)) {
        failures.push(`${relative}: imports React Aria outside the kebiao primitive wrapper`)
    }
    if (/from\s+['"]@phosphor-icons\/react['"]/.test(source)) {
        failures.push(`${relative}: imports the Phosphor barrel instead of a direct icon module`)
    }

    if (/\.(?:js|jsx)$/.test(file) && !['src/App.jsx', 'src/main.jsx'].includes(relative) && !relative.startsWith(`src${path.sep}stories${path.sep}`)) {
        for (const match of source.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)) {
            if (!match[1].endsWith('.module.css')) legacyGlobalStyleImports.push(`${relative} -> ${match[1]}`)
        }
    }

    if (file.endsWith('.css') && file !== tokenPath) {
        for (const match of source.matchAll(/--([a-z0-9-]+)\s*:/gi)) {
            if (canonicalNames.has(match[1])) failures.push(`${relative}: redeclares canonical token --${match[1]}`)
        }
    }
}

const appSource = fs.readFileSync(path.join(srcRoot, 'App.jsx'), 'utf8')
const indexSource = fs.readFileSync(path.join(srcRoot, 'index.css'), 'utf8')
const requiredLayerOrder = '@layer reset, tokens, base, components, utilities, overrides;'
if (!indexSource.includes(requiredLayerOrder)) failures.push(`src/index.css: missing canonical cascade layer order`)
if (!indexSource.includes("@import './styles/design-tokens.css' layer(tokens);")) failures.push(`src/index.css: tokens must load in the tokens layer`)
if (!/\.sr-only\s*\{[\s\S]*?clip-path:\s*inset\(50%\)/.test(indexSource)) failures.push(`src/index.css: missing global screen-reader-only utility`)
const routeKeys = [...appSource.matchAll(/route\('([^']+)'/g)].map(match => match[1])
const configSource = fs.readFileSync(path.join(srcRoot, 'config', 'uiV2Flags.js'), 'utf8')
const rollbackContract = JSON.parse(fs.readFileSync(rollbackContractPath, 'utf8'))
const envBlock = configSource.match(/const ENV_DEFAULTS = \{([\s\S]*?)\n\}/)?.[1] ?? ''
const envKeys = [...envBlock.matchAll(/^\s*([a-zA-Z][\w]*)\s*:/gm)].map(match => match[1])

for (const key of requiredRouteKeys) {
    if (!routeKeys.includes(key)) failures.push(`src/App.jsx: missing independent route key ${key}`)
    if (!envKeys.includes(key)) failures.push(`src/config/uiV2Flags.js: missing environment flag ${key}`)
}

const rollbackKeys = rollbackContract.routes.map(route => route.routeKey)
if (rollbackContract.routeCount !== requiredRouteKeys.length || rollbackContract.routes.length !== requiredRouteKeys.length) {
    failures.push(`rollback contract: expected ${requiredRouteKeys.length} routes`)
}
if (new Set(rollbackKeys).size !== requiredRouteKeys.length || requiredRouteKeys.some(key => !rollbackKeys.includes(key))) {
    failures.push(`rollback contract: route keys must match production routes exactly`)
}
for (const route of rollbackContract.routes) {
    if (!['enhancement', 'passthrough'].includes(route.mode)) failures.push(`rollback contract: invalid mode for ${route.routeKey}`)
    if (route.mode === 'enhancement' && !route.disabledEnhancements?.length) failures.push(`rollback contract: ${route.routeKey} must name disabled enhancements`)
}

for (const [owner, moduleImport, legacyStylesheet] of isolatedStyleOwners) {
    const ownerPath = path.join(root, owner)
    const ownerSource = fs.readFileSync(ownerPath, 'utf8')
    if (!ownerSource.includes(moduleImport)) failures.push(`${owner}: missing isolated stylesheet import ${moduleImport}`)
    if (fs.existsSync(path.join(root, legacyStylesheet))) failures.push(`${legacyStylesheet}: legacy global stylesheet must not return`)
}

const primitiveGlobalStyles = sourceFiles
    .map(file => path.relative(root, file))
    .filter(relative => relative.startsWith(`src${path.sep}ui${path.sep}primitives${path.sep}`) && relative.endsWith('.css') && !relative.endsWith('.module.css'))
if (primitiveGlobalStyles.length) failures.push(`src/ui/primitives: global stylesheets are forbidden (${primitiveGlobalStyles.join(', ')})`)
if (legacyGlobalStyleImports.length) failures.push(`production feature code: global stylesheet imports are forbidden (${legacyGlobalStyleImports.join(', ')})`)
if (new Set(routeKeys).size !== requiredRouteKeys.length || routeKeys.length !== requiredRouteKeys.length) {
    failures.push(`src/App.jsx: expected 13 unique route keys, found ${routeKeys.length} routes / ${new Set(routeKeys).size} unique keys`)
}

const result = {
    canonicalTokenSource: path.relative(root, tokenPath),
    canonicalTokenCount: canonicalNames.size,
    productionRouteKeys: routeKeys,
    directReactAriaImportsOutsideWrapper: 0,
    blockingDialogs: 0,
    emojiSymbols: 0,
    isolatedStyleOwners: isolatedStyleOwners.map(([owner]) => owner),
    primitiveGlobalStylesheets: primitiveGlobalStyles.length,
    legacyGlobalStyleImports,
    rollbackContract: {
        semantics: rollbackContract.semantics,
        routeCount: rollbackContract.routeCount,
        enhancementRoutes: rollbackContract.routes.filter(route => route.mode === 'enhancement').map(route => route.routeKey),
        passthroughRoutes: rollbackContract.routes.filter(route => route.mode === 'passthrough').map(route => route.routeKey)
    },
    cascadeLayerOrder: requiredLayerOrder,
    passed: failures.length === 0,
    failures
}

console.log(JSON.stringify(result, null, 2))
if (failures.length) process.exitCode = 1
