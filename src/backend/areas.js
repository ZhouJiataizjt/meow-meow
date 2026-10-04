// src/backend/areas.js
// 高校范围数据加载：data/areas.json 以 WGS84 存储（OSM 来源），
// 加载时统一转换为 GCJ-02，与高德底图及用户打点坐标对齐

const fs = require('fs')
const path = require('path')
const { wgs84ToGcj02 } = require('./utils')

const AREAS_FILE = path.join(__dirname, '../../data/areas.json')

// 把单个要素（校区/分区）的 WGS84 环数组转换为 GCJ-02，写入 polygons_gcj02
function convertFeature(feature) {
    const rings = Array.isArray(feature.polygons)
        ? feature.polygons
        : (Array.isArray(feature.polygon) ? [feature.polygon] : [])
    feature.polygons_gcj02 = rings.map(ring => ring.map(([la, ln]) => wgs84ToGcj02(la, ln)))
}

function loadAreasData() {
    try {
        const raw = JSON.parse(fs.readFileSync(AREAS_FILE, 'utf-8'))
        for (const uni of raw.universities || []) {
            for (const campus of uni.campuses || []) {
                convertFeature(campus)
                for (const zone of campus.zones || []) {
                    convertFeature(zone)
                }
            }
        }
        return raw
    } catch (e) {
        console.error('读取校园范围数据失败:', e)
        return { universities: [] }
    }
}

// 生成"所在校园"下拉选项：华工各校区单独列出并带全校选项，其他高校按校名聚合
function campusOptions(areasData) {
    const options = []
    for (const uni of areasData && areasData.universities || []) {
        const campuses = uni.campuses || []
        if (uni.name === '华南理工大学') {
            for (const campus of campuses) {
                options.push({ value: `${uni.name}·${campus.name}`, label: `${uni.name}·${campus.name}` })
            }
        } else if (campuses.length > 1) {
            options.push({ value: uni.name, label: `${uni.name}（全部校区）` })
            for (const campus of campuses) {
                options.push({ value: `${uni.name}·${campus.name}`, label: `　└ ${campus.name}` })
            }
        } else if (campuses.length === 1) {
            options.push({ value: uni.name, label: uni.name })
        }
    }
    return options
}

module.exports = { loadAreasData, campusOptions }
