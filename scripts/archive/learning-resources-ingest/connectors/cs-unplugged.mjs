import { LearningResourceConnector, markdownToBlocks, titleFromMarkdown } from './base.mjs'
import { githubRaw, githubRevision, githubTree } from './github.mjs'

export class CsUnpluggedConnector extends LearningResourceConnector {
  async discover() {
    const { repository, default_branch: branch } = this.source
    const revision = await githubRevision(repository, branch)
    const tree = await githubTree(repository, revision.revision)
    const introductions = tree.map(item => item.path)
      .filter(path => /^csunplugged\/(?:at_home|at_a_distance)\/content\/en\/[^/]+\/introduction\.md$/u.test(path))
      .slice(0, this.options.limit || 60)
    const candidates = []
    for (const path of introductions) {
      const markdown = await githubRaw(repository, revision.revision, path)
      const slug = path.split('/').at(-2)
      const blocks = markdownToBlocks(markdown, { locator: path, language: 'en' })
      if (!blocks.length) continue
      candidates.push({
        upstream_id: path,
        canonical_url: `https://www.csunplugged.org/en/topics/${slug}/`,
        title: titleFromMarkdown(markdown, slug.replaceAll('-', ' ')),
        source_language: 'en',
        source_subject: 'computer science',
        source_grade_range: 'primary / junior secondary',
        mapped_subject_slugs: ['information-technology'],
        mapped_china_stage: null,
        mapped_china_grade_scope: [4, 5, 6, 7, 8, 9],
        resource_type: 'activity',
        pedagogical_roles: ['explore', 'practice'],
        estimated_minutes: 30,
        visual_dependency: 'helpful',
        license_id: 'CC-BY-SA-4.0',
        attribution_text: `${titleFromMarkdown(markdown, slug)}，CS Unplugged，CC BY-SA 4.0`,
        blocks
      })
    }
    return { revision: revision.revision, git_commit: revision.revision, candidates }
  }
}

