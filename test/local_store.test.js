const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { initializeLocalStore } = require('../src/backend/local_store')

test('本地数据迁移保留旧记录，重启不覆盖新增数据', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meow-store-'))
    try {
        const legacy = path.join(root, 'legacy')
        fs.mkdirSync(legacy)
        fs.writeFileSync(path.join(legacy, 'records.json'), '[{"id":"old"}]')
        const files = initializeLocalStore(path.join(root, 'user'), legacy)
        assert.deepEqual(JSON.parse(fs.readFileSync(files.records)), [{ id: 'old' }])
        assert.deepEqual(JSON.parse(fs.readFileSync(files.map_records)), [])
        fs.writeFileSync(files.records, '[{"id":"new"}]')
        initializeLocalStore(path.join(root, 'user'), legacy)
        assert.deepEqual(JSON.parse(fs.readFileSync(files.records)), [{ id: 'new' }])
        assert.equal(fs.readFileSync(path.join(legacy, 'records.json'), 'utf8'), '[{"id":"old"}]')
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('损坏的旧数据不会被静默替换为空记录', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meow-store-'))
    try {
        fs.writeFileSync(path.join(root, 'records.json'), '{broken')
        assert.throws(() => initializeLocalStore(path.join(root, 'user'), root))
        assert.equal(fs.existsSync(path.join(root, 'user/data/records.json')), false)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})
