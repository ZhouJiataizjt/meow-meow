const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { profileUpdate, localProfile } = require('../src/backend/user_profile')
test('个人昵称可修改，固定 ID 和非允许字段不能被覆盖', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meow-profile-test-'))
    try {
        const file = path.join(directory, 'profile.json')
        const first = localProfile(file)
        assert.match(first.id, /^[a-f0-9-]{36}$/)
        const changed = localProfile(file, { username: '  小橘的朋友  ', email: 'ignored@example.com' })
        assert.equal(changed.id, first.id)
        assert.equal(changed.profile.username, '小橘的朋友')
        assert.equal(changed.profile.email, undefined)
        assert.equal(localProfile(file).id, first.id)
        assert.equal(localProfile(file).profile.username, '小橘的朋友')
        assert.throws(() => localProfile(file, { username: '篡改', id: 'other-id' }), /ID/)
        assert.equal(localProfile(file).profile.username, '小橘的朋友')
    } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
test('昵称拒绝空白、超长和控制字符，支持中文及 emoji', () => {
    for (const username of ['', '   ', '猫'.repeat(31), '猫\n友', null]) {
        assert.throws(() => profileUpdate({ username }, 'fixed'))
    }
    assert.equal(profileUpdate({ username: '🐱'.repeat(30) }, 'fixed').username, '🐱'.repeat(30))
})
