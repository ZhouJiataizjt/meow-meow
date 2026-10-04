// src/backend/areas.js
// 高校范围数据加载：data/areas.json 以 WGS84 存储（OSM 来源），
// 加载时统一转换为 GCJ-02，与高德底图及用户打点坐标对齐

const fs = require('fs')
const path = require('path')
const { wgs84ToGcj02 } = require('./utils')

const AREAS_FILE = path.join(__dirname, '../../data/areas.json')

function loadAreasData() {
    try {
        const raw = JSON.parse(fs.readFileSync(AREAS_FILE, 'utf-8'))
        for (const uni of raw.universities || []) {
            for (const campus of uni.campuses || []) {
                campus.polygon_gcj02 = (campus.polygon || []).map(([la, ln]) => wgs84ToGcj02(la, ln))
                for (const zone of campus.zones || []) {
                    zone.polygon_gcj02 = (zone.polygon || []).map(([la, ln]) => wgs84ToGcj02(la, ln))
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
