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
            // polygons 为外环数组，支持一个校区多个不相交的边界
            assert.ok(Array.isArray(campus.polygons) && campus.polygons.length >= 1,
                `${uni.name}${campus.name} 应有 polygons 外环数组`)
            for (const ring of campus.polygons) {
                const lats = ring.map(p => p[0])
                const lngs = ring.map(p => p[1])
                assert.ok(ring.length >= 3, `${uni.name}${campus.name} 每个环至少 3 点`)
                // 全部坐标应落在广州及周边范围内
                assert.ok(Math.min(...lats) > 22.5 && Math.max(...lats) < 23.6, `${uni.name}${campus.name} 纬度越界`)
                assert.ok(Math.min(...lngs) > 112.8 && Math.max(...lngs) < 114.0, `${uni.name}${campus.name} 经度越界`)
            }
        }
    }
})

test('华工大学城校区应保留全部外环（multipolygon 回归测试）', () => {
    // OSM 中该校区由主校区+一块飞地两个不相交外环组成，
    // 旧版构建脚本只保留第一个环导致边界缺失
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/areas.json'), 'utf-8'))
    const scut = raw.universities.find(u => u.name === '华南理工大学')
    const uctown = scut.campuses.find(c => c.name === '大学城校区')
    assert.ok(uctown.polygons.length >= 2, `大学城校区应有至少 2 个外环（实际 ${uctown.polygons.length}）`)
})

test('真实数据：华工五山校区内部采样点应命中校园判定', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/areas.json'), 'utf-8'))
    // areas.json 为 WGS84，detectArea 直接用原始多边形验证几何本身。
    // 校区边界可能是凹多边形（bbox 中心不一定在界内），
    // 因此从顶点向质心方向 20% 处采样，至少应有一点命中华工。
    const scut = raw.universities.find(u => u.name === '华南理工大学')
    const wushan = scut.campuses.find(c => c.name === '五山校区')
    const ring = wushan.polygons[0]
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

test('坐标系一致性：WGS84 判定结果转 GCJ02 后必须完全一致', () => {
    // 应用加载时把 areas.json 的 WGS84 多边形转为 GCJ02 再做判定，
    // 不变量：同一个点在 WGS84 数据上的判定结果（高校+校区），
    // 换算成 GCJ02 后在转换数据上必须命中完全相同的区域。
    // （五山片区各校边界在 OSM 中相邻交错，采样点可能合法落在他校界内，
    //   因此断言的是“转换前后一致”，而非“必须命中华工”。）
    const { loadAreasData } = require('../src/backend/areas')
    const gcjData = loadAreasData()
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/areas.json'), 'utf-8'))
    const scutRaw = raw.universities.find(u => u.name === '华南理工大学')
    const wushanRaw = scutRaw.campuses.find(c => c.name === '五山校区')
    const ring = wushanRaw.polygons[0]
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length

    let verified = 0
    let scutVerified = 0
    for (const [la, ln] of ring) {
        const sampleLat = la + 0.2 * (cx - la)
        const sampleLng = ln + 0.2 * (cy - ln)
        const rawMatch = detectArea(raw, sampleLat, sampleLng)
        if (!rawMatch) continue // 跳过落在所有界外的采样点（凹多边形）

        const [gLat, gLng] = wgs84ToGcj02(sampleLat, sampleLng)
        const match = detectArea(gcjData, gLat, gLng)
        assert.ok(match, `GCJ02 点应命中某个区域（原始判定：${formatArea(rawMatch)}）`)
        assert.strictEqual(match.university, rawMatch.university,
            `转换前后高校不一致：${formatArea(rawMatch)} vs ${formatArea(match)}`)
        assert.strictEqual(match.campus, rawMatch.campus,
            `转换前后校区不一致：${formatArea(rawMatch)} vs ${formatArea(match)}`)
        verified++
        if (rawMatch.university === '华南理工大学') scutVerified++
    }
    assert.ok(verified >= 5, `应有足够多有效采样点（实际 ${verified}）`)
    assert.ok(scutVerified >= 3, `应有足够多命中华工的采样点（实际 ${scutVerified}）`)
})

// ---------- 猫点聚合 ----------

const { clusterRecords } = require('../src/backend/utils')

test('clusterRecords 50 米内的打卡聚为一簇', () => {
    // 纬度 0.00009 度 ≈ 10 米
    const mk = (id, lat, lng) => ({ id, lat, lng })
    const records = [
        mk(1, 23.0500, 113.3900),
        mk(2, 23.05009, 113.3900), // 距 1 约 10m，同簇
        mk(3, 23.05040, 113.3900), // 距 1 约 44m，同簇
        mk(4, 23.0510, 113.3900),  // 距 1 约 110m，新簇
        mk(5, 23.05009, 113.3900)  // 距 1 约 10m，但应聚到更近的已有簇（首个匹配）
    ]
    const clusters = clusterRecords(records, 50, r => ({ lat: r.lat, lng: r.lng }))
    assert.strictEqual(clusters.length, 2)
    assert.strictEqual(clusters[0].members.length, 4)
    assert.strictEqual(clusters[1].members.length, 1)
    assert.strictEqual(clusters[0].seed, records[0])
})

test('clusterRecords 无法定位的记录自成一组', () => {
    const clusters = clusterRecords([
        { id: 1, lat: 23.0, lng: 113.0 },
        { id: 2 }, // 无坐标
        { id: 3, lat: 'bad', lng: null } // 非法坐标
    ], 50, r => ({ lat: r.lat, lng: r.lng }))
    assert.strictEqual(clusters.length, 3)
    assert.strictEqual(clusters[1].center, null)
    assert.strictEqual(clusters[2].center, null)
})

test('clusterRecords 空输入与缺省 getCoords', () => {
    assert.deepStrictEqual(clusterRecords([], 50, r => r), [])
    assert.strictEqual(clusterRecords([{ id: 1 }], 50).length, 1) // 无 getCoords 全部自成一簇
})

// ---------- 出没时段分布 ----------

test('computeStats 输出时段分布且分桶正确', () => {
    const records = [
        { time: '2026-06-01T06:30' },  // 清晨
        { time: '2026-06-02T10:00' },  // 上午
        { time: '2026-06-03T21:15' },  // 夜间
        { time: '2026-06-04T02:00' },  // 夜间（跨零点）
        { time: '2026-06-05T16:00' },  // 傍晚
        { id: 1780275600000 }          // 时间戳记录（约 2026-06-01 11:00 UTC → 本地时区可能跨桶）
    ]
    const stats = computeStats(records, [], [])
    assert.strictEqual(stats.timeBuckets.length, 5)
    const byName = Object.fromEntries(stats.timeBuckets.map(b => [b.name, b.count]))
    assert.strictEqual(byName['清晨 5-9点'], 1)
    assert.strictEqual(byName['上午 9-12点'], 2) // 含时间戳记录（北京时间上午）
    assert.strictEqual(byName['傍晚 15-19点'], 1)
    assert.strictEqual(byName['夜间 19-5点'], 2)
    const total = stats.timeBuckets.reduce((s, b) => s + b.count, 0)
    assert.strictEqual(total, 6)
})

test('bucketIndexForHour 覆盖全天 24 小时', () => {
    const { bucketIndexForHour } = require('../src/backend/utils')
    for (let h = 0; h < 24; h++) {
        assert.ok(bucketIndexForHour(h) >= 0, `小时 ${h} 应落在某个时段`)
    }
})
