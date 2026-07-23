import { LearningResourceConnector, markdownToBlocks, titleFromMarkdown } from './base.mjs'
import { githubRaw, githubRevision, githubSubtree } from './github.mjs'

export class MdnZhCnConnector extends LearningResourceConnector {
  async discover() {
    const { repository, default_branch: branch } = this.source
    const revision = await githubRevision(repository, branch)
    const tree = await githubSubtree(repository, revision.revision, 'files/zh-cn/learn_web_development')
    const paths = tree.map(item => item.path)
      .filter(path => /^files\/zh-cn\/learn_web_development\/.+\/index\.md$/u.test(path))
      .filter(path => !/\/(?:assessment|test_your_skills)\//u.test(path))
      .slice(0, this.options.limit || 80)
    const candidates = []
    for (const path of paths) {
      const markdown = await githubRaw(repository, revision.revision, path)
      const title = titleFromMarkdown(markdown, path.split('/').at(-2).replaceAll('_', ' '))
      const blocks = markdownToBlocks(markdown, { locator: path, language: 'zh-Hans' })
      if (!blocks.length) continue
      const slug = path.replace(/^files\/zh-cn\//u, '').replace(/\/index\.md$/u, '')
      candidates.push({
        upstream_id: slug,
        canonical_url: `https://developer.mozilla.org/zh-CN/docs/${slug.split('/').map(part => part.replaceAll('_', '-')).join('/')}`,
        title,
        source_language: 'zh-Hans',
        source_subject: 'web development and computing',
        source_grade_range: 'junior secondary extension',
        mapped_subject_slugs: ['information-technology'],
        mapped_china_stage: 'junior',
        mapped_china_grade_scope: [7, 8, 9],
        resource_type: 'explanation',
        pedagogical_roles: ['explain', 'practice', 'extend'],
        estimated_minutes: 20,
        visual_dependency: 'helpful',
        license_id: 'CC-BY-SA-2.5',
        attribution_text: `${title}，MDN contributors，CC BY-SA 2.5`,
        blocks
      })
    }
    return { revision: revision.revision, git_commit: revision.revision, candidates }
  }
}
