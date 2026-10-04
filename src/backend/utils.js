// src/backend/utils.js
// 纯函数工具集：不依赖 Electron，可被主进程、渲染进程和测试共同使用

// 转义 HTML 特殊字符，防止用户输入被拼进 innerHTML 后注入标签
function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

// 转义后的值用于 HTML 属性（如 src/href）时，额外拦截危险伪协议
function safeResourceUrl(value) {
    const trimmed = String(value ?? '').trim()
    if (/^\s*(javascript|vbscript)\s*:/i.test(trimmed)) return ''
    // data: 协议只放行图片类型，阻断 data:text/html 等注入载体
    if (/^data:/i.test(trimmed) && !/^data:\s*image\/(png|jpe?g|gif|webp|bmp)\s*;/i.test(trimmed)) return ''
    return escapeHtml(trimmed)
}

// 根据文件扩展名返回 MIME 类型
function getMimeType(filePath) {
    const ext = String(filePath).toLowerCase().split('.').pop()
    const map = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        bmp: 'image/bmp'
    }
    return map[ext] || 'image/jpeg'
}

// 在记录数组中定位一条记录：优先按 id 匹配，找不到再退回下标。
// 修复了“搜索过滤后按下标操作会命中错误记录”的问题
function findRecordIndex(records, { index, id } = {}) {
    if (!Array.isArray(records)) return -1
    if (id !== undefined && id !== null && id !== '') {
        const byId = records.findIndex(r => String(r.id) === String(id))
        if (byId >= 0) return byId
    }
    if (Number.isInteger(index) && index >= 0 && index < records.length) return index
    return -1
}

// 从记录中解析出时间戳；兼容 time 字符串、created_at 和时间戳形式的 id
function parseRecordTime(record) {
    if (!record) return 0
    if (record.created_at) {
        const t = new Date(record.created_at).getTime()
        if (!Number.isNaN(t)) return t
    }
    if (record.time) {
        const t = new Date(String(record.time).replace(' ', 'T')).getTime()
        if (!Number.isNaN(t)) return t
    }
    if (typeof record.id === 'number' && record.id > 1000000000000) return record.id
    return 0
}

// 数值型的猫咪数量，解析失败按 1 只算
function parseCatCount(value) {
    const n = parseInt(value, 10)
    return Number.isFinite(n) && n > 0 ? n : 1
}

function topN(countMap, n) {
    return Object.entries(countMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n)
}

// 统计面板数据：观察记录（records）+ 地图打卡（mapRecords）+ 猫咪档案（cats）
function computeStats(records = [], mapRecords = [], cats = [], now = new Date()) {
    const all = [...(Array.isArray(records) ? records : []), ...(Array.isArray(mapRecords) ? mapRecords : [])]

    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

    let totalCatsSeen = 0
    let monthCatsSeen = 0
    const locationCount = {}
    const speciesCount = {}
    const monthlyCount = {}

    for (const record of all) {
        const count = parseCatCount(record.count)
        totalCatsSeen += count

        const t = parseRecordTime(record)
        if (t >= monthStart) monthCatsSeen += count
        if (t > 0) {
            const d = new Date(t)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            monthlyCount[key] = (monthlyCount[key] || 0) + 1
        }

        const location = String(record.location || record.title || '').trim()
        if (location) locationCount[location] = (locationCount[location] || 0) + 1

        const species = String(record.species || '').trim()
        if (species) speciesCount[species] = (speciesCount[species] || 0) + 1
    }

    // 最近 6 个月的记录条数趋势（含空月份）
    const monthly = []
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthly.push({ month: key, count: monthlyCount[key] || 0 })
    }

    return {
        recordCount: all.length,
        personalCount: Array.isArray(records) ? records.length : 0,
        mapCount: Array.isArray(mapRecords) ? mapRecords.length : 0,
        catProfileCount: Array.isArray(cats) ? cats.length : 0,
        totalCatsSeen,
        monthCatsSeen,
        monthLabel: monthPrefix,
        topLocations: topN(locationCount, 5),
        topSpecies: topN(speciesCount, 5),
        monthly
    }
}

module.exports = {
    escapeHtml,
    safeResourceUrl,
    getMimeType,
    findRecordIndex,
    parseRecordTime,
    parseCatCount,
    computeStats
}
