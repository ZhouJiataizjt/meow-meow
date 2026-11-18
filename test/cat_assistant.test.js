const test = require('node:test')
const assert = require('node:assert/strict')
const { findSightings, askDashScope, campusInventory } = require('../server/cat-assistant')
/* global Response */

test('检索公开打卡并只将指定的记录字段发送给百炼', async () => {
    const sightings = await findSightings(async (sql, params) => {
        assert.match(sql, /e.kind IN \('records','map_records'\)/)
        assert.match(sql, /is_demo/)
        assert.ok(params.includes('大橘'))
        assert.ok(params.includes('书馆'))
        return [{
            kind: 'map_records', user_id: 'owner', id: 'rec', title: '大橘的午后', name: '大橘', area: '图书馆',
            observed_at: '2026-11-17T15:30', lat: '23', lng: '113'
        }, {
            kind: 'records', user_id: 'owner', id: 'rec', name: '大橘', location: '图书馆西门',
            observed_at: '2026-11-15T15:30'
        }]
    }, '大橘最近在图书馆出现过吗？')
    const reply = await askDashScope({
        apiKey: 'test-key', question: '大橘在哪？', sightings,
        fetchImpl: async (url, options) => {
            assert.match(url, /^https:\/\/.+\/chat\/completions$/)
            assert.equal(options.headers.Authorization, 'Bearer test-key')
            const payload = JSON.parse(options.body)
            assert.equal(payload.stream, true)
            const data = JSON.parse(payload.messages[1].content)
            assert.equal(data.question, '大橘在哪？')
            assert.deepEqual(Object.keys(data.records[0]), ['reference', 'name', 'title', 'location', 'species', 'observedAt'])
            assert.equal(data.records[1].location, '图书馆西门')
            return new Response([
                'data: {"choices":[{"delta":{"reasoning_content":"内部过程"}}]}',
                'data: {"choices":[{"delta":{"content":"大橘曾在图书馆出现[1][2]。"}}]}',
                'data: {"choices":[]}',
                'data: [DONE]'
            ].join('\r\n\r\n'))
        }
    })
    assert.equal(reply.answer, '大橘曾在图书馆出现[1][2]。')
    assert.equal(reply.sources[0].id, 'owner~rec')
    assert.equal(reply.sources[0].lat, 23)
    assert.equal(reply.sources[1].lat, null)
})

test('上游中断时拒绝把不完整的回答当作成功', async () => {
    await assert.rejects(askDashScope({
        apiKey: 'test-key', question: '大橘在哪？', sightings: [],
        fetchImpl: async () => new Response('data: {"choices":[{"delta":{"content":"部分回答"}}]}\n')
    }), /incomplete upstream answer/)
})

test('校园清单列全真实记录和示例，档案昵称优先于打卡标题', async () => {
    const rows = [
        { name: '娘口三三', title: '娘口三三', is_demo: 0, category_total: 2 },
        { name: '大橘', title: 'meow', is_demo: 0, category_total: 2 },
        ...[1, 2, 3].map(n => ({ name: `示例猫·1-${n}`, is_demo: 1, category_total: 3 }))
    ]
    const result = await campusInventory(async (sql, params) => {
        assert.match(sql, /PARTITION BY is_demo/)
        assert.deepEqual(params, Array(4).fill('华南理工大学'))
        return rows
    }, '华南理工大学内有哪些猫猫记录')
    assert.match(result.answer, /真实观察 · 2 条/)
    assert.match(result.answer, /大橘（记录标题：meow）/)
    assert.match(result.answer, /示例打卡（模拟数据） · 3 条/)
    for (const row of rows) assert.ok(result.answer.includes(row.name))
    assert.equal(result.sources.length, 5)
})

test('校园清单保留明确指定的校区，时间或品种问题继续使用问答检索', async () => {
    const result = await campusInventory(async (_sql, params) => {
        assert.deepEqual(params.slice(-3), ['五山校区', '华南理工大学·五山校区', '五山校区'])
        return []
    }, '华工五山校区有哪些猫咪观察？')
    assert.match(result.answer, /华南理工大学·五山校区暂无/)
    const unexpected = () => { throw new Error('不应运行校园清单查询') }
    assert.equal(await campusInventory(unexpected, '华工今天有哪些猫咪观察？'), null)
    assert.equal(await campusInventory(unexpected, '华工有哪些橘猫？'), null)
})
