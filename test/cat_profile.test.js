const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeCat } = require('../src/backend/cat_profile')

test('猫咪昵称必填，用户修改不能覆盖固定 ID 或创建时间', () => {
    assert.throws(() => normalizeCat({ name: '   ' }), /昵称/)
    assert.throws(() => normalizeCat({ name: '猫'.repeat(81) }), /80/)
    assert.deepEqual(normalizeCat({ name: ' 大橘 ', features: ' 白爪 ', id: 'changed', created_at: 'changed' }), {
        name: '大橘', species: '', features: '白爪', notes: ''
    })
})
