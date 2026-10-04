// src/backend/image_utils.js
// 依赖 Electron 的图片处理，仅供主进程使用（nativeImage 在渲染进程行为不一致）

const { nativeImage } = require('electron')
const fs = require('fs')
const { getMimeType } = require('./utils')

const MAX_EDGE = 1600      // 长边超过该值时等比缩小
const JPEG_QUALITY = 80

// 把本地图片压缩成适合上传的 Buffer：
// - PNG 且无需缩放时原样返回，避免透明通道被 JPEG 压成黑底
// - 其余情况转 JPEG（质量 80），转换失败时退回原始文件内容
function compressImageForUpload(filePath) {
    const raw = fs.readFileSync(filePath)
    const image = nativeImage.createFromPath(filePath)
    if (image.isEmpty()) return { buffer: raw, mimeType: getMimeType(filePath) }

    const { width, height } = image.getSize()
    const needsResize = Math.max(width, height) > MAX_EDGE
    const isPng = getMimeType(filePath) === 'image/png'

    if (isPng && !needsResize) {
        return { buffer: raw, mimeType: 'image/png' }
    }

    let out = image
    if (needsResize) {
        const scale = MAX_EDGE / Math.max(width, height)
        out = image.resize({
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale))
        })
    }

    const jpeg = out.toJPEG(JPEG_QUALITY)
    if (!jpeg || jpeg.length === 0) {
        return { buffer: raw, mimeType: getMimeType(filePath) }
    }
    return { buffer: jpeg, mimeType: 'image/jpeg' }
}

module.exports = { compressImageForUpload }
