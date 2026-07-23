import { LearningResourceConnector, splitStoryMarkdown, titleFromMarkdown } from './base.mjs'
import { githubRaw, githubRevision, githubTree } from './github.mjs'

function metadata(markdown, label) {
  return markdown.match(new RegExp(`^\\* ${label}:\\s*(.+)$`, 'imu'))?.[1]?.trim() || ''
}

export class AfricanStorybookConnector extends LearningResourceConnector {
  async discover() {
    const { repository, default_branch: branch } = this.source
    const revision = await githubRevision(repository, branch)
    const tree = await githubTree(repository, revision.revision)
    const paths = tree.map(item => item.path)
      .filter(path => /^en\/\d+_[a-z0-9-]+\.md$/u.test(path))
      .slice(0, this.options.limit || 80)
    const candidates = []
    for (const path of paths) {
      const markdown = await githubRaw(repository, revision.revision, path)
      const license = metadata(markdown, 'License').toUpperCase().replace(/[\[\]]/gu, '')
      if (license.includes('NC') || (!license.includes('CC-BY') && !license.includes('CC BY'))) continue
      const id = path.split('/').at(-1).replace(/\.md$/u, '')
      const title = titleFromMarkdown(markdown, id)
      candidates.push({
        upstream_id: id,
        canonical_url: `https://global-asp.github.io/storybooks/english/stories/${id.split('_')[0]}/`,
        title,
        creators: [metadata(markdown, 'Text'), metadata(markdown, 'Illustration')].filter(Boolean),
        attribution_text: `${title}，African Storybook，${metadata(markdown, 'License') || 'CC BY 4.0'}`,
        source_language: 'en',
        source_subject: 'graded story and literacy',
        source_grade_range: 'primary',
        mapped_subject_slugs: ['chinese', 'english'],
        mapped_china_stage: 'primary',
        mapped_china_grade_scope: [1, 2, 3, 4],
        resource_type: 'story',
        pedagogical_roles: ['model', 'extend'],
        estimated_minutes: 8,
        visual_dependency: 'helpful',
        license_id: 'CC-BY-4.0',
        fragments: splitStoryMarkdown(markdown, { locator: path, language: 'en' })
          .filter(fragment => !fragment.blocks.every(block => /^license:|^text:|^illustration:|^language:/iu.test(block.text)))
      })
    }
    return { revision: revision.revision, git_commit: revision.revision, candidates }
  }
}

