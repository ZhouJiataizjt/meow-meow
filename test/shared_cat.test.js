const test = require('node:test')
const assert = require('node:assert/strict')
const { catReference, parseCatReference, projectCat, projectObservation } = require('../server/cat-identity')

test('共享猫咪的完整 ID 区分历史同 ID，旧观察保留关联', () => {
    assert.notEqual(catReference('alice','same'), catReference('bob','same'))
    assert.deepEqual(parseCatReference('alice~same','bob'), {owner:'alice',id:'same'})
    assert.deepEqual(parseCatReference('same','bob'), {owner:'bob',id:'same'})
    assert.equal(parseCatReference('alice~x~y','bob'), null)
    assert.equal(projectObservation({cat_id:'same'},'alice').cat_id, 'alice~same')
    const shared = projectObservation({cat_id:'same',cat_owner_id:'alice'},'bob')
    assert.equal(shared.cat_id, 'alice~same')
    assert.equal(shared.cat_owner_id, undefined)
})
test('共享猫咪只公开身份字段，创建者保留私有备注', () => {
    const row={user_id:'alice',id:'cat',payload:{name:'年糕',species:'橘白猫',features:'白爪',notes:'私有备注',avatar:'builtin:cat',secret:'private'}}
    const shared = projectCat(row,'bob')
    assert.equal(shared.is_mine,false)
    assert.equal(shared.notes,undefined)
    assert.equal(shared.secret,undefined)
    assert.equal(shared.id,'alice~cat')
    assert.equal(projectCat(row,'alice').notes,'私有备注')
    assert.equal(projectCat(row,'alice',true).notes,undefined)
})
