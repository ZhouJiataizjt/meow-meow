const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { Readable } = require('node:stream')
const { URL } = require('node:url')

test('云端资料接口强制登录、按会话隔离昵称，拒绝修改 ID', async () => {
    const profiles = new Map()
    let handler
    let ready
    const started = new Promise(resolve => { ready = resolve })
    const query = async (sql, args) => {
        if (sql === 'SELECT 1') return [[{ ok: 1 }]]
        if (sql.startsWith('SELECT u.id,u.email')) {
            return [[{ id: 'fixed-user-id', email: 'cat@example.com' }]]
        }
        if (sql.startsWith('SELECT username FROM user_profiles')) return [[...(profiles.has(args[0]) ? [{ username: profiles.get(args[0]) }] : [])]]
        if (sql.startsWith('INSERT INTO user_profiles')) { profiles.set(args[0], args[1]); return [{ affectedRows: 1 }] }
        throw new Error('Unexpected query: ' + sql)
    }
    const mocks = {
        'node:http': { createServer(fn) { handler = fn; return { listen() { ready() } } } },
        'node:fs/promises': { readFile: async () => '{"database":{}}', mkdir: async () => {} },
        'mysql2/promise': { createPool: () => ({ execute: query }) }
    }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8'), {
        require: name => mocks[name] || require(name), URL, Buffer, console, setTimeout,
        process: { env: {}, on() {}, exit() { throw new Error('Server failed to initialize') } }
    })
    await started
    async function request(method, input, authenticated = true) {
        const req = Readable.from(input === undefined ? [] : [Buffer.from(JSON.stringify(input))])
        req.method = method; req.url = '/profile'; req.headers = authenticated ? { authorization: 'Bearer ' + 'a'.repeat(64) } : {}
        const res = { headersSent: false, writeHead(status) { this.status = status; this.headersSent = true }, end(data) { this.data = JSON.parse(data) } }
        await handler(req, res)
        return res
    }
    assert.equal((await request('GET', undefined, false)).status, 401)
    const initial = await request('GET')
    assert.equal(initial.data.id, 'fixed-user-id')
    const updated = await request('PUT', { username: '云端猫友', email: 'cannot-change@example.com' })
    assert.equal(updated.status, 200)
    assert.equal(updated.data.profile.username, '云端猫友')
    assert.equal(updated.data.email, 'cat@example.com')
    assert.equal((await request('GET')).data.profile.username, '云端猫友')
    assert.equal((await request('PUT', { username: '篡改', id: 'another-id' })).status, 400)
    assert.equal((await request('PUT', { username: ' ' })).status, 400)
    assert.equal(profiles.size, 1)
    assert.equal(profiles.get('fixed-user-id'), '云端猫友')
})
