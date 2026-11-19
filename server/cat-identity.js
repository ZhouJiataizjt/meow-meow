// Existing rows keep their owner-local IDs. A public reference disambiguates
// historical collisions without rewriting records or merging cats by name.
function catReference(owner, id) { return `${owner}~${id}` }
function parseCatReference(value, fallbackOwner) {
    const parts = String(value).split('~')
    const owner = parts.length === 2 ? parts[0] : fallbackOwner
    const id = parts.length === 2 ? parts[1] : parts[0]
    if (parts.length > 2 || !/^[\w-]{1,80}$/.test(id) || !/^[\w-]{1,80}$/.test(owner || '')) return null
    return { owner, id }
}
function projectObservation(payload, owner) {
    const copy = { ...payload }
    if (copy.cat_id) copy.cat_id = catReference(copy.cat_owner_id || owner, copy.cat_id)
    delete copy.cat_owner_id
    return copy
}
function projectCat(row, viewer, search = false) {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
    const mine = row.user_id === viewer
    // Notes stay private to the creator, including in global search.
    const result = { id: catReference(row.user_id, row.id), name: payload.name,
        species: payload.species || '', features: payload.features || '',
        is_mine: mine, created_at: payload.created_at }
    if (!search) {
        result.avatar = payload.avatar || ''
        if (mine) result.notes = payload.notes || ''
        if (payload.is_demo) result.is_demo = true
    }
    return result
}
const catOwnerSql = alias => `COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${alias}.payload,'$.cat_owner_id')),'null'),${alias}.user_id)`
module.exports = { catReference, parseCatReference, projectObservation, projectCat, catOwnerSql }
