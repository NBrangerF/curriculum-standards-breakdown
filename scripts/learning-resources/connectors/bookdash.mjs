import { LearningResourceConnector, markdownToBlocks, titleFromMarkdown } from './base.mjs'
import { githubRaw, githubRevision, githubTree } from './github.mjs'

export class BookDashConnector extends LearningResourceConnector {
  async discover() {
    const { repository, default_branch: branch } = this.source
    const revision = await githubRevision(repository, branch)
    const tree = await githubTree(repository, revision.revision)
    const paths = tree
      .map(item => item.path)
      .filter(path => /^[^/]+\/en\/index\.md$/u.test(path))
      .slice(0, this.options.limit || 60)
    const candidates = []
    for (const path of paths) {
      const markdown = await githubRaw(repository, revision.revision, path)
      const slug = path.split('/')[0]
      const blocks = markdownToBlocks(markdown, { locator: path, language: 'en' })
        .filter(block => !/^(contents|copyright)$/iu.test(block.text))
      if (!blocks.length) continue
      candidates.push({
        upstream_id: slug,
        canonical_url: `https://bookdash.org/books/${slug}/`,
        title: titleFromMarkdown(markdown, slug.replaceAll('-', ' ')),
        source_language: 'en',
        source_subject: 'early literacy story',
        source_grade_range: 'early years / primary',
        mapped_subject_slugs: ['chinese', 'english'],
        mapped_china_stage: 'primary',
        mapped_china_grade_scope: [1, 2, 3],
        resource_type: 'story',
        pedagogical_roles: ['model', 'extend'],
        estimated_minutes: 10,
        visual_dependency: 'helpful',
        license_id: 'CC-BY-4.0',
        attribution_text: `Book Dash《${titleFromMarkdown(markdown, slug)}》，CC BY 4.0`,
        blocks
      })
    }
    return { revision: revision.revision, git_commit: revision.revision, candidates }
  }
}

