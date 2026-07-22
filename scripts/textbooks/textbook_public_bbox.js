const REQUIRED_BBOX_FIELDS = ['x', 'y', 'width', 'height', 'page_width', 'page_height']

export function bboxRenderabilityError(bbox) {
  if (bbox === null || bbox === undefined) return null
  if (typeof bbox !== 'object' || Array.isArray(bbox)) return 'must be an object or null'

  for (const field of REQUIRED_BBOX_FIELDS) {
    if (!Number.isFinite(bbox[field])) return `${field} must be a finite number`
  }
  if (bbox.x < 0 || bbox.y < 0) return 'x and y must be non-negative'
  if (bbox.width <= 0 || bbox.height <= 0) return 'width and height must be positive'
  if (bbox.page_width <= 0 || bbox.page_height <= 0) return 'page_width and page_height must be positive'
  if (bbox.x + bbox.width > bbox.page_width) return 'x + width exceeds page_width'
  if (bbox.y + bbox.height > bbox.page_height) return 'y + height exceeds page_height'

  return null
}
