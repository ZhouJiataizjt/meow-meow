const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const htmlDir = path.join(__dirname, '../src/frontend/html')
const source = fs.readFileSync(path.join(htmlDir, 'map.html'), 'utf8')

test('所有页面内联脚本均可解析', () => {
    for (const file of fs.readdirSync(htmlDir).filter(f => f.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(htmlDir, file), 'utf8')
        for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
            new vm.Script(match[1], { filename: file })
        }
    }
})

function harness(saveResult = true) {
    const elements = new Map()
    const element = id => {
        if (!elements.has(id)) {
            const classes = new Set()
            elements.set(id, { style: {}, value: '', textContent: '', focus() {},
                classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } })
        }
        return elements.get(id)
    }
    const events = {}
    const calls = []
    const alerts = []
    const state = {
        document: { getElementById: element },
        requestAnimationFrame: callback => callback(),
        window: { focus() {}, addEventListener: (name, callback) => { events[name] = callback } },
        map: { on: (name, callback) => { events[name] = callback }, closePopup() {} },
        ipcRenderer: { invoke: async (...args) => { calls.push(args); return saveResult } },
        alert: message => alerts.push(message),
        console: { error() {} },
        areaOfCoords: () => ({ text: '测试校园', match: null }),
        formatArea: () => '',
        catPicker: { value: 'cat-test-id', validate() {} },
        isAdding: false, editingRecordId: 'previous', currentLatLng: null,
        selectedImagePaths: [],
        clearForm() { element('record-title').value = ''; state.selectedImagePaths = [] },
        updateImagePreview() {},
        loadMapRecords: async () => { state.reloaded = true },
        closeModal() { element('modal').style.display = 'none' }
    }
    vm.createContext(state)
    const flow = source.slice(source.indexOf('    function startAddingMode()'), source.indexOf('    function closeModal()'))
    const save = source.slice(source.indexOf('    async function saveRecord()'), source.indexOf('    function filterList()'))
    vm.runInContext(flow + save, state)
    return { state, element, events, calls, alerts }
}

test('新增入口立即打开表单，选点保留草稿，保存后刷新并关闭', async () => {
    const { state, element, events, calls } = harness()
    events.message({ data: { type: 'start-map-add' } })
    assert.equal(element('modal').style.display, 'flex')
    assert.equal(state.editingRecordId, null)
    element('record-title').value = '校园橘猫'
    element('record-desc').value = '教学楼旁'
    state.selectedImagePaths = ['cat.png']
    state.pickObservationLocation()
    assert.equal(element('map').classList.contains('location-picking'), true)
    assert.equal(element('location-hint').style.display, 'block')
    events.click({ latlng: { lat: 23.05, lng: 113.39 } })
    assert.equal(element('map').classList.contains('location-picking'), false)
    assert.equal(element('modal').style.display, 'flex')
    assert.equal(element('record-title').value, '校园橘猫')
    assert.deepEqual(state.selectedImagePaths, ['cat.png'])
    await state.saveRecord()
    assert.equal(calls[0][0], 'add_map_record')
    assert.equal(calls[0][1].lat, 23.05)
    assert.equal(calls[0][1].title, '校园橘猫')
    assert.equal(calls[0][1].cat_id, 'cat-test-id')
    assert.equal(state.reloaded, true)
    assert.equal(element('modal').style.display, 'none')
})

test('未选位置不能保存，保存失败保留表单和内容', async () => {
    const { state, element, calls, alerts } = harness(false)
    state.startAddingMode()
    element('record-title').value = '橘猫'
    await state.saveRecord()
    assert.equal(calls.length, 0)
    assert.match(element('observation-error').textContent, /选择位置/)
    assert.equal(alerts.length, 0)
    state.currentLatLng = { lat: 23, lng: 113 }
    await state.saveRecord()
    assert.equal(element('modal').style.display, 'flex')
    assert.equal(element('record-title').value, '橘猫')
    assert.equal(element('save-observation').disabled, false)
    assert.match(element('observation-error').textContent, /保存失败/)
    assert.equal(alerts.length, 0)
})
