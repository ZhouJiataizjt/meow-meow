const fs = require('node:fs')
const { randomUUID } = require('node:crypto')

function profileUpdate(input, userId) {
    if (!input || typeof input.username !== 'string') throw new Error('请填写昵称')
    if (input.id !== undefined && input.id !== userId) throw new Error('用户 ID 不可修改')
    const username = input.username.trim()
    if (!username || [...username].length > 30 || /[\u0000-\u001f\u007f]/.test(username)) throw new Error('昵称需为 1–30 个字符，且不能包含控制字符')
    return { username }
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
module.exports = { profileUpdate, localProfile }
