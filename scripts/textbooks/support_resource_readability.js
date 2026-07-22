const SHA256_PATTERN = /^[a-f0-9]{64}$/
const ASSET_ID_PATTERN = /^asset_[a-z0-9]+$/i

/**
 * A support-resource reader can only be advertised when the public catalog
 * contains a complete content-addressed PDF asset. Storage reachability is
 * checked later when the server creates the viewer session.
 */
export function isReadableSupportResource(resource) {
  const asset = resource?.asset
  if (!asset || asset.availability !== 'available') return false
  if (asset.media_type !== 'application/pdf') return false
  if (!ASSET_ID_PATTERN.test(String(asset.asset_id || ''))) return false
  if (!SHA256_PATTERN.test(String(asset.sha256 || ''))) return false
  if (!Number.isInteger(asset.bytes) || asset.bytes <= 0) return false
  if (!Number.isInteger(asset.pages) || asset.pages <= 0) return false
  const expectedObjectPath = `objects/sha256/${asset.sha256.slice(0, 2)}/${asset.sha256}.pdf`
  return asset.object_path === expectedObjectPath
}

export function readableSupportResourceIds(catalog) {
  return new Set((catalog?.resources || [])
    .filter(isReadableSupportResource)
    .map(resource => resource.resource_id)
    .filter(Boolean))
}

/**
 * Keep bibliographic/structural data public while retaining storage locators
 * only in the server-side catalog and registry.
 */
export function redactSupportResourceCatalogForPublic(catalog) {
  return {
    ...catalog,
    resources: (catalog?.resources || []).map(resource => ({
      ...resource,
      asset: {
        ...resource.asset,
        sha256: null,
        source_path: null,
        object_path: null,
        local_path: null,
        r2_bucket: null,
        r2_key: null
      },
      provenance: {
        ...resource.provenance,
        source_ref: null,
        generated_from: null
      }
    }))
  }
}
