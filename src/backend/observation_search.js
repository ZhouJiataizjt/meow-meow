function combineObservations(ordinary, mapped, cats) {
    const names = new Map(cats.map(cat => [String(cat.id), cat]))
    const normalize = (record, source, index) => {
        const cat = names.get(String(record.cat_id))
        return { ...record, _source: source, _sourceIndex: index, _raw: record,
            time: record.time || record.created_at || '',
            location: (source === 'map' ? record.title || record.location : record.location || record.title) || record.area || (Number.isFinite(record.lat) ? `${record.lat.toFixed(5)}, ${record.lng.toFixed(5)}` : ''),
            species: record.species || cat?.species || '',
            gender: record.gender || cat?.features || '',
            cat_name: cat?.name || record.cat_name || '',
            source_label: source === 'map' ? '地图打卡' : '观察记录' }
    }
    return [...ordinary.map((r,i) => normalize(r,'record',i)), ...mapped.map((r,i) => normalize(r,'map',i))]
}
const SEARCH_FIELDS = ['time','location','count','species','gender','area','cat_name','cat_id','title','desc','id','source_label']
function filterObservations(records, { query = '', field = 'all', source = 'all', sort = '', direction = 1 } = {}) {
    const terms = String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
    const fields = field === 'all' ? SEARCH_FIELDS : SEARCH_FIELDS.includes(field) ? [field] : []
    const result = records.filter(record => (source === 'all' || record._source === source) && terms.every(term =>
        fields.some(key => String(record[key] ?? '').replace('T', ' ').toLocaleLowerCase().includes(term))))
    if (sort) result.sort((a,b) => {
        if (sort === 'count') return ((Number(a.count) || 0) - (Number(b.count) || 0)) * direction
        return String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), 'zh-CN', { numeric: true }) * direction
    })
    return result
}
module.exports = { combineObservations, filterObservations }
