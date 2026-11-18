// src/backend/image_utils.js
// 依赖 Electron 的图片处理，仅供主进程使用（nativeImage 在渲染进程行为不一致）

const { nativeImage } = require('electron')
const fs = require('fs')
const { getMimeType } = require('./utils')
const { MAX_AVATAR_BYTES, AVATAR_PREFIX } = require('./user_profile')

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

function profileAvatarFromFile(filePath) {
    if (fs.statSync(filePath).size > 20 * 1024 * 1024) throw new Error('请选择小于 20 MB 的照片')
    const image = nativeImage.createFromPath(filePath)
    if (image.isEmpty()) throw new Error('无法打开这张图片，请选择 JPG 或 PNG')
    const { width, height } = image.getSize()
    const side = Math.min(width, height)
    const square = image.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
    const resized = square.resize({ width: Math.min(side, 192), height: Math.min(side, 192), quality: 'best' })
    for (const quality of [86, 72, 55]) {
        const jpeg = resized.toJPEG(quality)
        if (jpeg.length && jpeg.length <= MAX_AVATAR_BYTES) return AVATAR_PREFIX + jpeg.toString('base64')
    }
    throw new Error('无法生成头像，请换一张图片')
}

module.exports = { compressImageForUpload, profileAvatarFromFile }
