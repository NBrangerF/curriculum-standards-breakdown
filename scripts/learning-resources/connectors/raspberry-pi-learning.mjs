import { LearningResourceConnector, markdownToBlocks, titleFromMarkdown } from './base.mjs'
import { githubOrgRepos, githubRaw, githubRevision, githubTree } from './github.mjs'

export class RaspberryPiLearningConnector extends LearningResourceConnector {
  async discover() {
    const repoLimit = Math.min(80, Math.max(1, Number(this.options.repoLimit || this.options.limit || 30)))
    const repos = (await githubOrgRepos(this.source.organization, 240))
      .filter(repo => !repo.archived && !repo.disabled && repo.name !== 'components')
      .filter(repo => !String(repo.description || '').includes('[NOT MAINTAINED]'))
      .slice(0, repoLimit)
    const candidates = []
    const revisions = []
    for (const repo of repos) {
      try {
        const revision = await githubRevision(repo.full_name, repo.default_branch)
        const tree = await githubTree(repo.full_name, revision.revision)
        const paths = tree.map(item => item.path)
          .filter(path => /^en\/step_\d+\.md$/u.test(path))
          .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
          .slice(0, 16)
        if (!paths.length) continue
        const fragments = []
        for (const [index, path] of paths.entries()) {
          const markdown = await githubRaw(repo.full_name, revision.revision, path)
          const blocks = markdownToBlocks(markdown, { locator: `${repo.full_name}/${path}`, language: 'en' })
          if (!blocks.length) continue
          fragments.push({
            upstream_fragment_id: path,
            fragment_type: 'activity_step',
            order: index,
            title: titleFromMarkdown(markdown, `Step ${index + 1}`),
            source_locator: `https://github.com/${repo.full_name}/blob/${revision.revision}/${path}`,
            blocks,
            visual_dependency: 'helpful'
          })
        }
        if (!fragments.length) continue
        revisions.push(`${repo.full_name}@${revision.revision}`)
        candidates.push({
          upstream_id: repo.name,
          canonical_url: repo.homepage || repo.html_url,
          title: String(repo.description || repo.name).replace(/\.$/u, ''),
          source_language: 'en',
          source_subject: 'computing project',
          source_grade_range: 'primary / junior secondary',
          mapped_subject_slugs: ['information-technology'],
          mapped_china_stage: null,
          mapped_china_grade_scope: [4, 5, 6, 7, 8, 9],
          resource_type: 'activity',
          pedagogical_roles: ['explore', 'practice', 'extend'],
          estimated_minutes: 45,
          visual_dependency: 'helpful',
          license_id: 'CC-BY-SA-4.0',
          attribution_text: `${repo.name}，Raspberry Pi Foundation，CC BY-SA 4.0`,
          fragments
        })
      } catch (error) {
        if (this.options.strict) throw error
      }
    }
    return {
      revision: revisions.length ? `org-snapshot-${Date.now()}` : 'unavailable',
      candidates
    }
  }
}

