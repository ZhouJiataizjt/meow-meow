// 一次性构建脚本：从 OpenStreetMap (Overpass API) 拉取广州高校边界，
// 简化后生成 data/areas.json。产物提交到仓库后，本脚本仅在未来更新边界时手动重跑。
// 用法: node .tmp/build_areas.js
const fs = require('fs')

const OVERPASS = 'https://overpass-api.de/api/interpreter'
const UA = 'meow-meow-map/2.1 (campus area data fetch)'

// relation/way id → 高校与校区归属
const RELATIONS = {
    9087908: { university: '华南理工大学', campus: '五山校区', zones: 'quadrant' },
    13970408: { university: '华南理工大学', campus: '大学城校区', zones: 'quadrant' },
    12384400: { university: '华南农业大学', campus: '主校区' },
    13970366: { university: '中山大学', campus: '广州校区东校园' },
    13970368: { university: '华南师范大学', campus: '大学城校园' },
    13970405: { university: '广州大学', campus: '大学城校区' },
    13970406: { university: '广州美术学院', campus: '大学城校区' },
    13970407: { university: '广东工业大学', campus: '大学城校区' },
    13970409: { university: '广州中医药大学', campus: '大学城校区' },
    17909943: { university: '广东药科大学', campus: '大学城校园' },
    13900183: { university: '广东外语外贸大学', campus: '大学城校区' }
}
const WAYS = {
    300917756: { university: '中山大学', campus: '广州校区南校园' },
    329612854: { university: '南方医科大学', campus: '主校区' },
    360056995: { university: '暨南大学', campus: '石牌校区' },
    370947228: { university: '华南师范大学', campus: '石牌校园' }
}

const relIds = Object.keys(RELATIONS).map(id => `relation(${id});`).join('')
const wayIds = Object.keys(WAYS).map(id => `way(${id});`).join('')
const query = `[out:json][timeout:90];(${relIds}${wayIds});out geom;`

async function main() {
    console.log('fetching geometry from Overpass...')
    const res = await fetch(OVERPASS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query)
    })
    if (!res.ok) throw new Error('Overpass HTTP ' + res.status)
    const data = await res.json()
    const byId = new Map(data.elements.map(e => [e.type + '/' + e.id, e]))

    const universities = []
    const addToUniversities = (university, campus, polygon, source) => {
        let uni = universities.find(u => u.name === university)
        if (!uni) {
            uni = { name: university, campuses: [] }
            universities.push(uni)
        }
        uni.campuses.push({ name: campus, polygon, source, zones: [] })
    }

    for (const [id, meta] of Object.entries(RELATIONS)) {
        const rel = byId.get('relation/' + id)
        if (!rel) { console.warn('missing relation', id); continue }
        const ring = assembleOuterRing(rel.members || [])
        if (!ring) { console.warn('no outer ring for relation', id); continue }
        const simplified = simplifyRing(ring)
        addToUniversities(meta.university, meta.campus, simplified, `OSM relation ${id}`)
        console.log(meta.university, meta.campus, '->', simplified.length, 'points')
    }

    for (const [id, meta] of Object.entries(WAYS)) {
        const way = byId.get('way/' + id)
        if (!way || !way.geometry) { console.warn('missing way', id); continue }
        const ring = way.geometry.map(p => [p.lat, p.lon])
        const simplified = simplifyRing(ring)
        addToUniversities(meta.university, meta.campus, simplified, `OSM way ${id}`)
        console.log(meta.university, meta.campus, '->', simplified.length, 'points')
    }

    addScutInternationalCampus(universities)
    addQuadrantZones(universities)

    const output = {
        note: '高校范围数据。多边形坐标为 WGS84（OSM 原始坐标系），应用加载时会转换为 GCJ-02 与高德底图对齐。zones 为粗略的校内分区（按校区范围象限切分），可在本文件中手工编辑调整。',
        updated_at: new Date().toISOString().slice(0, 10),
        universities
    }
    fs.writeFileSync(__dirname + '/../data/areas.json', JSON.stringify(output, null, 2))
    console.log('written data/areas.json')
}

// 把 multipolygon 的 outer 成员按端点拼接成一个闭合环（取最长的一个外环）
function assembleOuterRing(members) {
    const segments = members
        .filter(m => m.type === 'way' && m.role === 'outer' && m.geometry)
        .map(m => m.geometry.map(p => [p.lat, p.lon]).filter(([lat, lon]) => lat != null))
        .filter(seg => seg.length > 1)
    if (segments.length === 0) return null

    const EPS = 1e-9
    const same = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS

    let ring = segments.shift()
    let extended = true
    while (extended && segments.length > 0) {
        extended = false
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i]
            const head = ring[0], tail = ring[ring.length - 1]
            if (same(tail, seg[0])) { ring = ring.concat(seg.slice(1)); segments.splice(i, 1); extended = true; break }
            if (same(tail, seg[seg.length - 1])) { ring = ring.concat(seg.slice().reverse().slice(1)); segments.splice(i, 1); extended = true; break }
            if (same(head, seg[seg.length - 1])) { ring = seg.slice(0, -1).concat(ring); segments.splice(i, 1); extended = true; break }
            if (same(head, seg[0])) { ring = seg.slice().reverse().slice(0, -1).concat(ring); segments.splice(i, 1); extended = true; break }
        }
    }
    return ring
}

// Douglas-Peucker 简化，最多保留 maxPoints 个点
function simplifyRing(ring, maxPoints = 80) {
    const closed = ring.slice()
    if (closed.length > 1) {
        const first = closed[0], last = closed[closed.length - 1]
        if (first[0] !== last[0] || first[1] !== last[1]) closed.push(first)
    }
    let tolerance = 0.00008
    let simplified = douglasPeucker(closed, tolerance)
    while (simplified.length > maxPoints) {
        tolerance *= 1.6
        simplified = douglasPeucker(closed, tolerance)
    }
    return simplified.map(([lat, lng]) => [Number(lat.toFixed(6)), Number(lng.toFixed(6))])
}

function douglasPeucker(points, tolerance) {
    if (points.length <= 3) return points.slice()
    const keep = new Array(points.length).fill(false)
    keep[0] = keep[points.length - 1] = true
    const stack = [[0, points.length - 1]]
    while (stack.length) {
        const [start, end] = stack.pop()
        let maxDist = 0, index = -1
        const a = points[start], b = points[end]
        for (let i = start + 1; i < end; i++) {
            const d = pointToSegmentDist(points[i], a, b)
            if (d > maxDist) { maxDist = d; index = i }
        }
        if (maxDist > tolerance && index > 0) {
            keep[index] = true
            stack.push([start, index], [index, end])
        }
    }
    return points.filter((_, i) => keep[i])
}

function pointToSegmentDist(p, a, b) {
    const [x, y] = p, [x1, y1] = a, [x2, y2] = b
    const dx = x2 - x1, dy = y2 - y1
    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1)
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

// 华工国际校区未收录进 OSM，手工录入近似范围（广州番禺，兴业大道旁）
function addScutInternationalCampus(universities) {
    const polygon = [
        [23.0042, 113.3571], [23.0056, 113.3648], [23.0026, 113.3719],
        [22.9962, 113.3745], [22.9896, 113.3705], [22.9878, 113.3623],
        [22.9913, 113.3561], [22.9983, 113.3538]
    ]
    let uni = universities.find(u => u.name === '华南理工大学')
    if (!uni) { uni = { name: '华南理工大学', campuses: [] }; universities.unshift(uni) }
    uni.campuses.push({
        name: '广州国际校区',
        polygon,
        source: '手工录入（近似范围，可修正）',
        zones: []
    })
}

// 为指定校区生成按象限切分的校内分区（示例，可在 areas.json 手工编辑）
function addQuadrantZones(universities) {
    for (const uni of universities) {
        if (uni.name !== '华南理工大学') continue
        for (const campus of uni.campuses) {
            if (!['五山校区', '大学城校区'].includes(campus.name)) continue
            const lats = campus.polygon.map(p => p[0])
            const lngs = campus.polygon.map(p => p[1])
            const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
            const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
            campus.zones = [
                { name: '西北片区', polygon: [[Math.max(...lats), Math.min(...lngs)], [Math.max(...lats), midLng], [midLat, midLng], [midLat, Math.min(...lngs)]] },
                { name: '东北片区', polygon: [[Math.max(...lats), midLng], [Math.max(...lats), Math.max(...lngs)], [midLat, Math.max(...lngs)], [midLat, midLng]] },
                { name: '西南片区', polygon: [[midLat, Math.min(...lngs)], [midLat, midLng], [Math.min(...lats), midLng], [Math.min(...lats), Math.min(...lngs)]] },
                { name: '东南片区', polygon: [[midLat, midLng], [midLat, Math.max(...lngs)], [Math.min(...lats), Math.max(...lngs)], [Math.min(...lats), midLng]] }
            ]
        }
    }
}

main().catch(err => { console.error(err); process.exit(1) })
