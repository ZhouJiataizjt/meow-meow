const test = require('node:test')
const assert = require('node:assert/strict')
const { combineObservations, filterObservations } = require('../src/backend/observation_search')
const records = combineObservations([
    { id: 'same', location: '图书馆', count: 10, species: '橘猫', gender: '白色尾巴' }
], [
    { id: 'same', title: '午睡的猫', created_at: '2026-11-17T12:30', cat_id: 'cat-a', area: '大学城', lat: 23.05, lng: 113.39, desc: '喜欢树荫' },
    { id: 'other', title: '教学楼旁', count: 2 }
], [{id:'cat-a',name:'大橘',species:'橘猫',features:'左耳缺角'}])
test('普通记录和本人地图打卡共同展示，保留原来源、ID和原始数据', () => {
    assert.equal(records.length, 3)
    assert.equal(records[1]._source, 'map')
    assert.equal(records[1]._sourceIndex, 0)
    assert.equal(records[1].time, '2026-11-17T12:30')
    assert.equal(records[1].cat_name, '大橘')
    assert.equal(records[1]._raw.lat, 23.05)
    assert.equal(records[1].count, undefined)
})
test('全字段、指定字段、多关键词和来源筛选保持正确', () => {
    assert.equal(filterObservations(records, {query:'大橘'}).length, 1)
    assert.equal(filterObservations(records, {query:'白色尾巴'}).length, 1)
    assert.equal(filterObservations(records, {query:'午睡',field:'species'}).length, 0)
    assert.equal(filterObservations(records, {query:'午睡',field:'location'}).length, 1)
    assert.equal(filterObservations(records, {query:'大学城 橘猫',source:'map'}).length, 1)
    assert.equal(filterObservations(records, {query:'   ',source:'map'}).length, 2)
})
test('排序不会取消筛选，数量按数值排序，不改变原数组', () => {
    const selected=filterObservations(records, {source:'map',sort:'location'})
    assert.equal(selected.length,2)
    assert.ok(selected.every(row=>row._source==='map'))
    const sorted=filterObservations(records,{sort:'count',direction:-1})
    assert.equal(sorted[0].count,10)
    assert.equal(sorted[1].count,2)
    assert.equal(records[0]._source,'record')
})
