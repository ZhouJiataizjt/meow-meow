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

module.exports = { loadAreasData }
