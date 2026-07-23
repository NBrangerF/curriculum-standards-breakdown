import { LearningResourceConnector, markdownToBlocks } from './base.mjs'

function lessonCandidates(payload, limit) {
  const roots = Array.isArray(payload) ? payload : Object.values(payload || {})
  const lessons = roots.flatMap(value => Array.isArray(value) ? value : Array.isArray(value?.lessons) ? value.lessons : [])
  return lessons.slice(0, limit).flatMap((lesson, index) => {
    const slug = lesson.lessonSlug || lesson.lesson_slug || lesson.slug || `lesson-${index + 1}`
    const title = lesson.lessonTitle || lesson.lesson_title || lesson.title || slug
    const sections = [
      ['学习目标', lesson.lessonOutcome || lesson.lesson_outcome || lesson.learningOutcome],
      ['关键词', (lesson.keywords || []).map(value => value.keyword || value).join('；')],
      ['前置知识', (lesson.priorKnowledgeRequirements || lesson.prior_knowledge || []).join('\n')],
      ['常见误解', (lesson.misconceptionsAndCommonMistakes || lesson.misconceptions || []).join('\n')],
      ['视频讲稿', lesson.transcriptSentences || lesson.transcript_sentences || lesson.transcript]
    ].filter(([, value]) => value && String(value).trim())
    const blocks = sections.flatMap(([heading, value]) => markdownToBlocks(`# ${heading}\n\n${value}`, {
      locator: `oak:${slug}:${heading}`,
      language: 'en'
    }))
    if (!blocks.length) return []
    const subject = String(lesson.subjectTitle || lesson.subject_slug || lesson.subject || '')
    return [{
      upstream_id: slug,
      canonical_url: `https://www.thenational.academy/teachers/lessons/${slug}`,
      title,
      source_language: 'en',
      source_curriculum: 'Oak National Academy',
      source_subject: subject,
      source_grade_range: String(lesson.yearTitle || lesson.year || lesson.keyStageTitle || ''),
      mapped_subject_slugs: /math/iu.test(subject) ? ['math'] : /science/iu.test(subject) ? ['science'] : [],
      mapped_china_stage: null,
      mapped_china_grade_scope: [],
      mapping_status: 'unmapped',
      resource_type: 'lesson',
      pedagogical_roles: ['explain', 'practice', 'assess', 'teacher_support'],
      estimated_minutes: 50,
      visual_dependency: 'helpful',
      license_id: 'OGL-3.0',
      attribution_text: `${title}，Oak National Academy，Open Government Licence v3.0`,
      media_type: 'application/json',
      blocks
    }]
  })
}

export class OakConnector extends LearningResourceConnector {
  async discover() {
    const fixturePath = this.options.fixture
    if (fixturePath) {
      const { readFile } = await import('node:fs/promises')
      const payload = JSON.parse(await readFile(fixturePath, 'utf8'))
      return { revision: payload.revision || 'fixture', candidates: lessonCandidates(payload.data || payload, this.options.limit || 60) }
    }
    const apiKey = process.env.OAK_API_KEY
    if (!apiKey) throw new Error('Oak live connector requires OAK_API_KEY or --fixture')
    const subjects = this.options.subjects || ['maths', 'science', 'english', 'computing']
    const response = await fetch('https://open-api.thenational.academy/api/bulk', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'user-agent': 'kebiao-learning-resources/1.0'
      },
      body: JSON.stringify({ subjects })
    })
    if (!response.ok) throw new Error(`Oak bulk API failed: ${response.status} ${await response.text()}`)
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('json')) {
      throw new Error(`Oak bulk endpoint returned ${contentType}; ZIP extraction must run in the external worker`)
    }
    const payload = await response.json()
    return {
      revision: response.headers.get('etag') || new Date().toISOString(),
      candidates: lessonCandidates(payload, this.options.limit || 60)
    }
  }
}

