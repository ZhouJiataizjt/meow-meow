const avatarPresets = require('../../data/cat-avatar-presets.json')
const { safeResourceUrl } = require('./utils')

function defaultCatAvatar(key) {
    let hash = 0
    for (const character of String(key ?? '')) hash = (hash * 31 + character.codePointAt(0)) >>> 0
    return '../assets/cat-avatars/' + avatarPresets[hash % avatarPresets.length].asset
}

function catAvatarUrl(value, key) {
    const preset = avatarPresets.find(item => item.id === value)
    if (preset) return '../assets/cat-avatars/' + preset.asset
    if (value && !String(value).startsWith('builtin:') && safeResourceUrl(value)) return String(value).trim()
    return defaultCatAvatar(key)
}

module.exports = { avatarPresets, defaultCatAvatar, catAvatarUrl }
