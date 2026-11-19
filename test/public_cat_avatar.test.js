const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { URL } = require('node:url')

test('游客公开地图保留关联猫咪的上传头像，内置头像和自动分配仍可使用', async () => {
    let handler, ready
    const started = new Promise(resolve => { ready = resolve })
    const avatar = '/uploads/12345678-1234-1234-1234-123456789abc'
    const query = async sql => {
        if (sql === 'SELECT 1') return [[{}]]
        if (sql.includes('SELECT e.user_id,e.kind,e.id')) return [[avatar, 'builtin:cat', null].map((cat_avatar, i) => ({
            user_id: 'other', kind: 'map_records', id: String(i), cat_name: '猫', cat_avatar, payload: { cat_id: 'cat-' + i }
        }))]
        throw Error('Unexpected SQL: ' + sql)
    }
    const mocks = {
        'node:http': { createServer(fn) { handler = fn; return { listen() { ready() } } } },
        'node:fs/promises': { readFile: async () => '{"database":{}}', mkdir: async () => {} },
        'mysql2/promise': { createPool: () => ({ execute: query }) }
    }
    const file = path.join(__dirname, '../server/index.js')
    const realRequire = createRequire(file)
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        require: name => mocks[name] || realRequire(name), URL, Buffer, console, setTimeout,
        process: { env: {}, on() {}, exit() { throw Error('startup failed') } }
    })
    await started
    const req = { method: 'GET', url: '/map_records', headers: {} }
    const res = { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
    await handler(req, res)
    assert.equal(res.status, 200)
    assert.equal(res.body.items[0].cat_avatar, avatar)
    assert.equal(res.body.items[1].cat_avatar, 'builtin:cat')
    assert.equal(res.body.items[2].cat_avatar, undefined)
})
