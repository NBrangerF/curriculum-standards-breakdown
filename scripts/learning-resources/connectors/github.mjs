const API_ROOT = 'https://api.github.com'
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function fetchWithRetry(url, options = {}) {
  const attempts = Number(process.env.LEARNING_RESOURCE_FETCH_ATTEMPTS || 4)
  const timeoutMs = Number(process.env.LEARNING_RESOURCE_FETCH_TIMEOUT_MS || 30_000)
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) return response
      await response.body?.cancel()
      lastError = new Error(`HTTP ${response.status} from ${url}`)
    } catch (error) {
      lastError = error
      if (attempt === attempts) throw error
    } finally {
      clearTimeout(timeout)
    }
    await sleep(Math.min(500 * (2 ** (attempt - 1)), 4_000))
  }
  throw lastError
}

function headers() {
  const value = {
    accept: 'application/vnd.github+json',
    'user-agent': 'kebiao-learning-resources/1.0'
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token) value.authorization = `Bearer ${token}`
  return value
}

async function githubJson(path) {
  const response = await fetchWithRetry(`${API_ROOT}${path}`, { headers: headers() })
  if (!response.ok) throw new Error(`GitHub ${path} failed: ${response.status} ${await response.text()}`)
  return response.json()
}

async function githubTreePayload(repository, treeish, recursive = false) {
  return githubJson(`/repos/${repository}/git/trees/${encodeURIComponent(treeish)}${recursive ? '?recursive=1' : ''}`)
}

export async function githubRevision(repository, branch) {
  const commit = await githubJson(`/repos/${repository}/commits/${encodeURIComponent(branch)}`)
  return {
    revision: commit.sha,
    committed_at: commit.commit?.committer?.date || commit.commit?.author?.date || new Date().toISOString()
  }
}

export async function githubTree(repository, branch) {
  const payload = await githubTreePayload(repository, branch, true)
  if (payload.truncated) throw new Error(`GitHub tree for ${repository} is truncated; connector requires scoped discovery`)
  return (payload.tree || []).filter(item => item.type === 'blob').map(item => ({
    path: item.path,
    sha: item.sha,
    size: item.size
  }))
}

export async function githubSubtree(repository, revision, rootPath) {
  const commit = await githubJson(`/repos/${repository}/git/commits/${encodeURIComponent(revision)}`)
  let treeSha = commit.tree?.sha
  if (!treeSha) throw new Error(`GitHub commit ${repository}@${revision} has no tree`)
  const parts = String(rootPath).split('/').filter(Boolean)
  for (const part of parts) {
    const tree = await githubTreePayload(repository, treeSha)
    const entry = (tree.tree || []).find(item => item.type === 'tree' && item.path === part)
    if (!entry?.sha) throw new Error(`GitHub subtree does not exist: ${repository}/${rootPath}`)
    treeSha = entry.sha
  }
  const payload = await githubTreePayload(repository, treeSha, true)
  if (payload.truncated) throw new Error(`GitHub subtree for ${repository}/${rootPath} is truncated`)
  return (payload.tree || []).filter(item => item.type === 'blob').map(item => ({
    path: `${rootPath}/${item.path}`,
    sha: item.sha,
    size: item.size
  }))
}

export async function githubRaw(repository, revision, path) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (!token) try {
    const response = await fetchWithRetry(`https://raw.githubusercontent.com/${repository}/${revision}/${path}`, {
      headers: { 'user-agent': 'kebiao-learning-resources/1.0' }
    })
    if (response.ok) return response.text()
    if (!RETRYABLE_STATUS.has(response.status)) {
      throw new Error(`GitHub raw ${repository}/${path} failed: ${response.status}`)
    }
  } catch {
    // Some networks can reach api.github.com while the raw content CDN is
    // temporarily unavailable. The Contents API is pinned to the same commit.
  }
  const payload = await githubJson(
    `/repos/${repository}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(revision)}`
  )
  if (payload.type !== 'file' || payload.encoding !== 'base64' || !payload.content) {
    throw new Error(`GitHub contents ${repository}/${path} did not return a base64 file`)
  }
  return Buffer.from(payload.content.replace(/\s/gu, ''), 'base64').toString('utf8')
}

export async function githubOrgRepos(organization, limit = 100) {
  const rows = []
  let page = 1
  while (rows.length < limit) {
    const batch = await githubJson(`/orgs/${organization}/repos?type=public&sort=updated&per_page=100&page=${page}`)
    if (!batch.length) break
    rows.push(...batch)
    if (batch.length < 100) break
    page += 1
  }
  return rows.slice(0, limit)
}
