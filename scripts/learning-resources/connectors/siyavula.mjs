import { LearningResourceConnector, markdownToBlocks } from './base.mjs'

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
}

function xhtmlToMarkdown(xhtml) {
  return decodeEntities(String(xhtml)
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/giu, (_, level, text) => `\n\n${'#'.repeat(Number(level))} ${text.replace(/<[^>]+>/gu, ' ')}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/giu, (_, text) => `\n- ${text.replace(/<[^>]+>/gu, ' ')}\n`)
    .replace(/<(?:p|div|section|article|br)[^>]*>/giu, '\n\n')
    .replace(/<\/(?:p|div|section|article)>/giu, '\n\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n'))
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'kebiao-learning-resources/1.0' },
    signal: AbortSignal.timeout(45_000)
  })
  if (!response.ok) throw new Error(`Siyavula page failed: ${response.status} ${url}`)
  return { text: await response.text(), revision: response.headers.get('etag') || response.headers.get('last-modified') }
}

export class SiyavulaConnector extends LearningResourceConnector {
  async discover() {
    const chapterLinks = []
    const revisions = []
    for (const grade of [7, 8, 9]) {
      const landingUrl = `https://www.siyavula.com/read/za/natural-sciences/grade-${grade}`
      const landing = await fetchText(landingUrl)
      revisions.push(landing.revision)
      for (const match of landing.text.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*chapter-title[^"']*["'][^>]*>([\s\S]*?)<\/a>/giu)) {
        chapterLinks.push({
          url: new URL(match[1], landingUrl).href,
          label: decodeEntities(match[2].replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim()),
          grade
        })
      }
    }
    const candidates = []
    for (const item of chapterLinks.slice(0, this.options.limit || 12)) {
      const chapterToc = await fetchText(item.url)
      revisions.push(chapterToc.revision)
      const sectionHref = chapterToc.text.match(
        /<a[^>]+href=["']([^"']+)["'][^>]*>\s*<span[^>]+class=["'][^"']*section-title[^"']*["']/iu
      )?.[1]
      if (!sectionHref) continue
      const sectionUrl = new URL(sectionHref.split(/[?#]/u)[0], item.url).href
      const chapter = await fetchText(sectionUrl)
      revisions.push(chapter.revision)
      const main = chapter.text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1] || ''
      const blocks = markdownToBlocks(xhtmlToMarkdown(main), { locator: sectionUrl, language: 'en' })
        .filter(block => !/^(?:South Africa|Natural Sciences Grade \d+|-)\s*$/iu.test(block.text))
        .slice(0, 24)
      if (!blocks.length) continue
      candidates.push({
        upstream_id: item.url,
        canonical_url: item.url,
        title: item.label,
        source_language: 'en',
        source_subject: 'natural science',
        source_grade_range: `Grade ${item.grade}`,
        mapped_subject_slugs: ['science'],
        mapped_china_stage: 'junior',
        mapped_china_grade_scope: [item.grade],
        mapping_status: 'candidate',
        resource_type: 'teacher_guide',
        audience: 'mixed',
        pedagogical_roles: ['teacher_support', 'explain', 'practice'],
        visual_dependency: 'helpful',
        license_id: 'CC-BY-3.0',
        attribution_text: `${item.label}，Siyavula，CC BY 3.0`,
        blocks,
        source_locator: sectionUrl
      })
    }
    return {
      revision: revisions.filter(Boolean).join('|') || 'catalog-live',
      candidates
    }
  }
}
