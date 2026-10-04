const { test } = require('node:test')
const assert = require('node:assert')
const {
    escapeHtml,
    safeResourceUrl,
    getMimeType,
    findRecordIndex,
    parseRecordTime,
    parseCatCount,
    computeStats
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
