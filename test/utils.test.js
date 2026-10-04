const { test } = require('node:test')
const assert = require('node:assert')
const {
    escapeHtml,
    safeResourceUrl,
    getMimeType,
    findRecordIndex,
    parseRecordTime,
    parseCatCount,
    computeStats,
    wgs84ToGcj02,
    pointInPolygon,
    haversineMeters,
    detectArea,
    nearestAreaLabel,
    formatArea
} = require('../src/backend/utils')

// ---------- escapeHtml / safeResourceUrl ----------

test('escapeHtml 转义所有危险字符', () => {
    assert.strictEqual(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;')
    assert.strictEqual(escapeHtml('a&b"c\'d'), 'a&amp;b&quot;c&#39;d')
    assert.strictEqual(escapeHtml(''), '')
    assert.strictEqual(escapeHtml(null), '')
    assert.strictEqual(escapeHtml(undefined), '')
    assert.strictEqual(escapeHtml(123), '123')
})

test('safeResourceUrl 拦截 javascript: 伪协议并转义普通 URL', () => {
    assert.strictEqual(safeResourceUrl('javascript:alert(1)'), '')
    assert.strictEqual(safeResourceUrl('JaVaScRiPt:alert(1)'), '')
    assert.strictEqual(safeResourceUrl('vbscript:x'), '')
    assert.strictEqual(safeResourceUrl('data:text/html,<script>'), '')
    assert.strictEqual(safeResourceUrl('data:text/html;base64,PHNjcmlwdD4='), '')
    // 图片类型的 data URL 应该放行
    assert.ok(safeResourceUrl('data:image/png;base64,iVBORw0KGgo=').length > 0)
    assert.strictEqual(safeResourceUrl('D:\\imgs\\cat.png'), 'D:\\imgs\\cat.png')
    assert.strictEqual(safeResourceUrl('http://x/a.png?b=1&c=2'), 'http://x/a.png?b=1&amp;c=2')
})

// ---------- getMimeType ----------

test('getMimeType 按扩展名返回 MIME', () => {
    assert.strictEqual(getMimeType('a.jpg'), 'image/jpeg')
    assert.strictEqual(getMimeType('a.JPEG'), 'image/jpeg')
    assert.strictEqual(getMimeType('a.png'), 'image/png')
    assert.strictEqual(getMimeType('a.webp'), 'image/webp')
    assert.strictEqual(getMimeType('noext'), 'image/jpeg')
})

// ---------- findRecordIndex ----------

const records = [
    { id: 1, time: '2026-01-01T10:00' },
    { id: 2, time: '2026-02-01T10:00' },
    { id: 3, time: '2026-03-01T10:00' }
]

test('findRecordIndex 优先按 id 匹配', () => {
    // id=1 在下标 0，但传入的下标指向另一条：应命中 id 对应的记录
    assert.strictEqual(findRecordIndex(records, { id: 1, index: 2 }), 0)
    assert.strictEqual(findRecordIndex(records, { id: '2' }), 1)
})

test('findRecordIndex 没有 id 时退回下标', () => {
    assert.strictEqual(findRecordIndex(records, { index: 1 }), 1)
    assert.strictEqual(findRecordIndex(records, {}), -1)
    assert.strictEqual(findRecordIndex(records, { index: 99 }), -1)
    assert.strictEqual(findRecordIndex(records, { index: -1 }), -1)
})

test('findRecordIndex id 不存在时退回下标', () => {
    assert.strictEqual(findRecordIndex(records, { id: 404, index: 1 }), 1)
})

// ---------- parseRecordTime / parseCatCount ----------

test('parseRecordTime 兼容 time / created_at / 时间戳 id', () => {
    const t1 = parseRecordTime({ time: '2026-01-02T10:30' })
    assert.strictEqual(new Date(t1).getMonth(), 0)
    const t2 = parseRecordTime({ created_at: '2026-06-01T00:00:00Z' })
    assert.ok(t2 > 0)
    const stamp = 1770000000000
    assert.strictEqual(parseRecordTime({ id: stamp }), stamp)
    assert.strictEqual(parseRecordTime({}), 0)
    assert.strictEqual(parseRecordTime(null), 0)
})

test('parseCatCount 解析失败按 1 算', () => {
    assert.strictEqual(parseCatCount('3'), 3)
    assert.strictEqual(parseCatCount(5), 5)
    assert.strictEqual(parseCatCount(''), 1)
    assert.strictEqual(parseCatCount('abc'), 1)
    assert.strictEqual(parseCatCount('-2'), 1)
})

// ---------- computeStats ----------

test('computeStats 汇总数量、地点、品种和月度趋势', () => {
    const now = new Date('2026-06-15T12:00:00')
    const personal = [
        { time: '2026-06-10T10:00', location: '小区花园', species: '橘猫', count: '2' },
        { time: '2026-05-01T10:00', location: '小区花园', species: '狸花猫', count: '1' },
        { time: '2026-01-01T10:00', location: '学校', species: '橘猫', count: '1' }
    ]
    const map = [
        // id 是时间戳：1780275600000 ≈ 2026-06-01（六月，参与“本月”统计）
        { id: 1780275600000, title: '公园东门', desc: '', lat: 1, lng: 1 },
        // 1700000000000 ≈ 2023-11，落在 6 个月趋势窗口之外
        { id: 1700000000000, title: '小区花园', desc: '' }
    ]
    const cats = [{ id: 1, name: '大橘' }, { id: 2, name: '花花' }]

    const stats = computeStats(personal, map, cats, now)

    assert.strictEqual(stats.recordCount, 5)
    assert.strictEqual(stats.personalCount, 3)
    assert.strictEqual(stats.mapCount, 2)
    assert.strictEqual(stats.catProfileCount, 2)
    // 本月 = 6 月：观察记录 2 只 + 地图打卡 1 只
    assert.strictEqual(stats.monthCatsSeen, 3)
    // 历史累计：观察 2+1+1，地图各按 1 只算
    assert.strictEqual(stats.totalCatsSeen, 6)
    assert.strictEqual(stats.topLocations[0].name, '小区花园')
    assert.ok(stats.topLocations[0].count >= 3)
    assert.strictEqual(stats.topSpecies[0].name, '橘猫')
    assert.strictEqual(stats.topSpecies[0].count, 2)
    assert.strictEqual(stats.monthly.length, 6)
    assert.strictEqual(stats.monthly[5].month, '2026-06')
    assert.strictEqual(stats.monthly[5].count, 2)
    assert.strictEqual(stats.monthly[0].count, 1) // 2026-01
})

test('computeStats 对空数据和非法输入安全', () => {
    const stats = computeStats(null, undefined, 'not-array')
    assert.strictEqual(stats.recordCount, 0)
    assert.strictEqual(stats.topLocations.length, 0)
    assert.strictEqual(stats.monthly.length, 6)
})

// ---------- 地理计算 ----------

test('wgs84ToGcj02 在广州产生合理的偏移（百米级）', () => {
    const [lat, lng] = [23.155, 113.352] // 华工五山附近
    const [gLat, gLng] = wgs84ToGcj02(lat, lng)
    assert.notStrictEqual(gLat, lat)
    assert.notStrictEqual(gLng, lng)
    const shift = haversineMeters(lat, lng, gLat, gLng)
    assert.ok(shift > 50 && shift < 800, `偏移 ${shift}m 应在 50-800m 之间`)
    // 中国境外应原样返回
    assert.deepStrictEqual(wgs84ToGcj02(35.0, -105.0), [35.0, -105.0])
})

test('pointInPolygon 射线法判定', () => {
    const square = [[0, 0], [0, 10], [10, 10], [10, 0]]
    assert.strictEqual(pointInPolygon(5, 5, square), true)
    assert.strictEqual(pointInPolygon(15, 5, square), false)
    assert.strictEqual(pointInPolygon(0, 0, square), true)   // 顶点算在内
    assert.strictEqual(pointInPolygon(5, 5, [[0, 0], [1, 1]]), false) // 环太小
    assert.strictEqual(pointInPolygon(5, 5, null), false)
})

test('detectArea 返回最细粒度的归属', () => {
    const areasData = {
        universities: [{
            name: '华南理工大学',
            campuses: [{
                name: '五山校区',
                polygon: [[0, 0], [0, 10], [10, 10], [10, 0]],
                zones: [{ name: '生活区', polygon: [[1, 1], [1, 4], [4, 4], [4, 1]] }]
            }]
        }]
    }
    assert.deepStrictEqual(detectArea(areasData, 2, 2), { university: '华南理工大学', campus: '五山校区', zone: '生活区' })
    assert.deepStrictEqual(detectArea(areasData, 7, 7), { university: '华南理工大学', campus: '五山校区', zone: null })
    assert.strictEqual(detectArea(areasData, 20, 20), null)
    assert.strictEqual(detectArea(null, 2, 2), null)
    assert.strictEqual(formatArea(detectArea(areasData, 2, 2)), '华南理工大学·五山校区·生活区')
    assert.strictEqual(formatArea(null), '')
})

test('nearestAreaLabel 给出最近的校园参考', () => {
    const areasData = {
        universities: [{
            name: '暨南大学',
            campuses: [{ name: '石牌校区', polygon: [[23.125, 113.380], [23.125, 113.390], [23.132, 113.390], [23.132, 113.380]] }]
        }]
    }
    // 距中心约 2km 内
    const label = nearestAreaLabel(areasData, 23.110, 113.385, 5000)
    assert.ok(label && label.includes('暨南大学·石牌校区'))
    // 超出上限返回 null
    assert.strictEqual(nearestAreaLabel(areasData, 30.000, 113.385, 5000), null)
})

// ---------- areas.json 数据健全性 ----------

const fs = require('node:fs')
const path = require('node:path')

test('data/areas.json 结构与坐标范围合法', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/areas.json'), 'utf-8'))
    assert.ok(Array.isArray(raw.universities) && raw.universities.length >= 10)

    const scut = raw.universities.find(u => u.name === '华南理工大学')
    assert.ok(scut, '必须包含华南理工大学')
    for (const campus of ['五山校区', '大学城校区', '广州国际校区']) {
        assert.ok(scut.campuses.some(c => c.name === campus), `华工应有 ${campus}`)
    }

    for (const uni of raw.universities) {
        for (const campus of uni.campuses) {
            const lats = campus.polygon.map(p => p[0])
            const lngs = campus.polygon.map(p => p[1])
            assert.ok(campus.polygon.length >= 3, `${uni.name}${campus.name} 多边形至少 3 点`)
            // 全部坐标应落在广州及周边范围内
            assert.ok(Math.min(...lats) > 22.5 && Math.max(...lats) < 23.6, `${uni.name}${campus.name} 纬度越界`)
            assert.ok(Math.min(...lngs) > 112.8 && Math.max(...lngs) < 114.0, `${uni.name}${campus.name} 经度越界`)
        }
    }
})

test('真实数据：华工五山校区内部采样点应命中校园判定', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/areas.json'), 'utf-8'))
    // areas.json 为 WGS84，detectArea 直接用原始多边形验证几何本身。
    // 校区边界可能是凹多边形（bbox 中心不一定在界内），
    // 因此从顶点向质心方向 20% 处采样，至少应有一点命中华工。
    const scut = raw.universities.find(u => u.name === '华南理工大学')
    const wushan = scut.campuses.find(c => c.name === '五山校区')
    const ring = wushan.polygon
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length

    let hit = null
    for (const [la, ln] of ring) {
        const match = detectArea(raw, la + 0.2 * (cx - la), ln + 0.2 * (cy - ln))
        if (match) { hit = match; break }
    }
    assert.ok(hit, '五山校区内部采样点应命中某个区域')
    assert.strictEqual(hit.university, '华南理工大学')
})

test('坐标系一致性：WGS84 界内点转 GCJ02 后仍应判定在同一校区', () => {
    // 应用加载时把 areas.json 的 WGS84 多边形转为 GCJ02 再做判定，
    // 因此“WGS84 内点 → GCJ02 → 在 GCJ02 多边形内”必须成立
    const { loadAreasData } = require('../src/backend/areas')
    const gcjData = loadAreasData()
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/areas.json'), 'utf-8'))
    const scutRaw = raw.universities.find(u => u.name === '华南理工大学')
    const wushanRaw = scutRaw.campuses.find(c => c.name === '五山校区')
    const ring = wushanRaw.polygon
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length

    let verified = 0
    for (const [la, ln] of ring) {
        const sampleLat = la + 0.2 * (cx - la)
        const sampleLng = ln + 0.2 * (cy - ln)
        if (!detectArea(raw, sampleLat, sampleLng)) continue // 跳过凹多边形界外采样点
        const [gLat, gLng] = wgs84ToGcj02(sampleLat, sampleLng)
        const match = detectArea(gcjData, gLat, gLng)
        assert.ok(match, 'GCJ02 点应命中某个区域')
        assert.strictEqual(match.university, '华南理工大学')
        verified++
    }
    assert.ok(verified >= 5, `应有足够多有效采样点（实际 ${verified}）`)
})
