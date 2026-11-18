const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const MAX_AVATAR_BYTES = 40 * 1024
const AVATAR_PREFIX = 'data:image/jpeg;base64,'

function profileUpdate(input, userId) {
    if (!input || typeof input.username !== 'string') throw new Error('请填写昵称')
    if (input.id !== undefined && input.id !== userId) throw new Error('用户 ID 不可修改')
    const username = input.username.trim()
    if (!username || [...username].length > 30 || /[\u0000-\u001f\u007f]/.test(username)) throw new Error('昵称需为 1–30 个字符，且不能包含控制字符')
    const update = { username }
    if (input.avatar_url !== undefined) {
        const avatar = input.avatar_url
        if (avatar !== null) {
            if (typeof avatar !== 'string' || !avatar.startsWith(AVATAR_PREFIX) ||
                avatar.length > AVATAR_PREFIX.length + Math.ceil(MAX_AVATAR_BYTES / 3) * 4) throw new Error('头像格式无效')
            const encoded = avatar.slice(AVATAR_PREFIX.length)
            const jpeg = Buffer.from(encoded, 'base64')
            if (jpeg.length < 5 || jpeg.length > MAX_AVATAR_BYTES || jpeg.toString('base64') !== encoded ||
                jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff ||
                jpeg.at(-2) !== 0xff || jpeg.at(-1) !== 0xd9) throw new Error('头像格式无效')
        }
        update.avatar_url = avatar
    }
    return update
}
function localProfile(file, input) {
    let current
    if (fs.existsSync(file)) current = JSON.parse(fs.readFileSync(file, 'utf8'))
    else {
        current = { id: randomUUID(), profile: { username: '猫咪观察员' } }
        fs.writeFileSync(file, JSON.stringify(current, null, 2), { flag: 'wx' })
    }
    if (input !== undefined) {
        current.profile = { ...current.profile, ...profileUpdate(input, current.id) }
        const temporary = file + '.tmp'
        fs.writeFileSync(temporary, JSON.stringify(current, null, 2))
        fs.renameSync(temporary, file)
    }
    return current
}
module.exports = { profileUpdate, localProfile, MAX_AVATAR_BYTES, AVATAR_PREFIX }
