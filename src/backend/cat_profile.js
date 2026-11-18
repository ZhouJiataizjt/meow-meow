// 只接受可编辑的档案字段，ID 和创建时间由主进程维护。
function normalizeCat(input) {
    const name = String(input?.name ?? '').trim()
    if (!name) throw new Error('请填写猫咪昵称')
    if (name.length > 80) throw new Error('猫咪昵称不能超过 80 个字符')
    const avatar = input?.avatar
    if (avatar !== undefined && typeof avatar !== 'string') throw new Error('头像格式无效')
    return {
        ...(avatar !== undefined ? { avatar } : {}),
        name,
        species: String(input?.species ?? '').trim(),
        features: String(input?.features ?? '').trim(),
        notes: String(input?.notes ?? '').trim()
    }
}

module.exports = { normalizeCat }
