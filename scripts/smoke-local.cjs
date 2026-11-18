// 用独立临时数据目录验证真实 Electron 窗口和本地保存，不写入用户记录。
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('node:assert/strict')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meow-desktop-smoke-'))
app.setPath('userData', directory)
delete process.env.MEOW_ENABLE_CLOUD
process.env.MEOW_LOCAL_MODE = '1'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => { console.error('Desktop smoke timed out'); app.exit(1) }, 30000)
require('../src/frontend/js/main')

app.whenReady().then(async () => {
    try {
        let main
        let frame
        for (let i = 0; i < 100; i++) {
            main = BrowserWindow.getAllWindows()[0]
            frame = main?.webContents.mainFrame.frames.find(f => f.url.endsWith('/map.html'))
            if (frame && await frame.executeJavaScript('typeof startAddingMode === "function"').catch(() => false)) break
            await delay(100)
        }
        assert.ok(frame, '地图页面加载')
        // 浏览态先真实命中校园 SVG，确认其统计弹窗仍能使用。
        await frame.executeJavaScript(`(() => {
            const paths = new Set(campusLayer.getLayers().map(layer => layer.getElement()));
            let hit;
            for (let y = 100; y < innerHeight - 60 && !hit; y += 8) {
                for (let x = 80; x < innerWidth - 60; x += 8) {
                    const target = document.elementFromPoint(x, y);
                    if (paths.has(target)) { hit = { x, y, target }; break; }
                }
            }
            if (!hit) throw new Error('没有找到可点击的校园区域');
            window.smokeCampusPoint = { x: hit.x, y: hit.y };
            hit.target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: hit.x, clientY: hit.y }));
            if (!map._popup?.isOpen()) throw new Error('浏览态校园统计未打开');
            map.closePopup();
        })()`)
        await main.webContents.executeJavaScript("document.getElementById('primary-action').click()")
        await delay(100)
        assert.equal(await frame.executeJavaScript("document.getElementById('modal').style.display"), 'flex')
        async function typeIntoObservation(id, text) {
            const point = await frame.executeJavaScript(`(() => {
                const input = document.getElementById(${JSON.stringify(id)});
                input.scrollIntoView({ block: 'center' });
                const rect = input.getBoundingClientRect();
                const outer = parent.document.getElementById('workspace-frame').getBoundingClientRect();
                return { x: Math.round(outer.x + rect.x + 20), y: Math.round(outer.y + rect.y + 12) };
            })()`)
            main.focus()
            main.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
            main.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
            main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] })
            main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] })
            for (const keyCode of text) main.webContents.sendInputEvent({ type: 'char', keyCode })
            await delay(100)
            const actual = await frame.executeJavaScript(`({value: document.getElementById(${JSON.stringify(id)}).value, active: document.activeElement.id, focused: document.hasFocus()})`)
            assert.equal(actual.value, text, JSON.stringify(actual))
        }
        await frame.executeJavaScript(`(async () => {
            window.alert = () => { throw new Error('输入校验不应使用阻塞弹窗'); };
            await catPicker.setValue();
            await saveRecord();
            if (!document.getElementById('observation-error').textContent.includes('标题')) throw new Error('缺少标题校验提示');
        })()`)
        await typeIntoObservation('record-title', 'Keyboard title')
        await typeIntoObservation('record-desc', 'Keyboard description')
        await frame.executeJavaScript("pickObservationLocation(); map.fire('click', { latlng: L.latLng(23.0549, 113.3973) });")
        await typeIntoObservation('record-title', '选点后仍可输入标题')
        await typeIntoObservation('record-desc', '选点后仍可输入描述')
        const result = await frame.executeJavaScript(`(async () => {
            const before = (await ipcRenderer.invoke('get_map_records')).length;
            await catPicker.setValue();
            document.querySelector('[data-cat-new]').click();
            document.querySelector('[data-cat-name]').value = '测试小橘';
            document.querySelector('[data-cat-features]').value = '左耳白毛';
            document.querySelector('[data-cat-create]').click();
            for (let i = 0; i < 100 && !catPicker.value; i++) await new Promise(resolve => setTimeout(resolve, 20));
            const catId = catPicker.value;
            if (!catId) throw new Error('新建猫咪后没有自动选中');
            document.getElementById('record-title').value = '本地流程验证';
            pickObservationLocation();
            const { x, y } = window.smokeCampusPoint;
            const target = document.elementFromPoint(x, y);
            if (target.classList.contains('leaflet-interactive')) throw new Error('校园仍在拦截选点');
            if (getComputedStyle(target).cursor !== 'crosshair') throw new Error('选点鼠标不是十字光标');
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
            if (document.getElementById('modal').style.display !== 'flex') throw new Error('点击校园未返回表单: ' + target.outerHTML.slice(0, 600) + ' adding=' + isAdding + ' targets=' + Object.keys(map._targets));
            if (map._popup?.isOpen()) throw new Error('选点时错误打开了校园统计');
            if (document.getElementById('map').classList.contains('location-picking')) throw new Error('选点后未恢复浏览状态');
            await saveRecord();
            const after = await ipcRenderer.invoke('get_map_records');
            return { before, after: after.length, title: after[after.length - 1].title,
                catId, linkedId: after[after.length - 1].cat_id,
                closed: document.getElementById('modal').style.display === 'none' };
        })()`)
        assert.equal(result.after, result.before + 1)
        assert.equal(result.title, '本地流程验证')
        assert.equal(result.closed, true)
        assert.equal(result.linkedId, result.catId)
        // 再次观察选择已有猫咪，修改昵称不改变 ID 或历史关联。
        const repeat = await frame.executeJavaScript(`(async () => {
            const catId = ${JSON.stringify(result.catId)};
            startAddingMode();
            await catPicker.setValue(catId);
            document.getElementById('record-title').value = '第二次遇见';
            currentLatLng = L.latLng(23.0549, 113.3973);
            await saveRecord();
            await ipcRenderer.invoke('update_cat', { id: catId, cat: { name: '小橘新昵称', id: 'invalid-change' } });
            const cats = await ipcRenderer.invoke('get_cats');
            const observations = await ipcRenderer.invoke('get_map_records');
            const cat = cats.find(c => c.id === catId);
            return { name: cat?.name, count: observations.filter(r => r.cat_id === catId).length };
        })()`)
        assert.equal(repeat.name, '小橘新昵称')
        assert.equal(repeat.count, 2)
        await main.webContents.executeJavaScript("ipcRenderer.invoke('open_add_record_window')")
        let recordWindow
        for (let i = 0; i < 100; i++) {
            recordWindow = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/add_record.html'))
            if (recordWindow && await recordWindow.webContents.executeJavaScript('typeof catPicker !== "undefined"').catch(() => false)) break
            await delay(50)
        }
        assert.ok(recordWindow, '普通观察表单加载')
        await recordWindow.webContents.executeJavaScript(`(async () => {
            await catPicker.setValue(${JSON.stringify(result.catId)});
            document.getElementById('location').value = '教学楼';
            document.getElementById('species').value = '橘猫';
            document.getElementById('gender').value = '左耳白毛';
            document.getElementById('recordForm').requestSubmit();
        })()`)
        for (let i = 0; i < 100 && !recordWindow.isDestroyed(); i++) await delay(20)
        assert.ok(recordWindow.isDestroyed(), '普通观察保存后关闭')
        const persisted = JSON.parse(fs.readFileSync(path.join(directory, 'data/map_records.json'), 'utf8'))
        assert.equal(persisted[persisted.length - 1].cat_id, result.catId)
        await main.webContents.executeJavaScript("appNavigate('cats')")
        let catsFrame
        for (let i = 0; i < 100; i++) {
            catsFrame = main.webContents.mainFrame.frames.find(f => f.url.endsWith('/cats.html'))
            if (catsFrame && await catsFrame.executeJavaScript('typeof sightingsOf === "function"').catch(() => false)) break
            await delay(50)
        }
        const timelineCount = await catsFrame.executeJavaScript(`(async () => { await loadAll(); showCatDetail(${JSON.stringify(result.catId)}); return document.querySelectorAll('.timeline-item').length; })()`)
        assert.equal(timelineCount, 3)
        console.log('PASS: 标题和描述真实键盘输入（校验提示后、选点后）、校园选点、新建猫咪、固定 ID、时间线及持久化')
        clearTimeout(timeout)
        app.exit(0)
    } catch (error) {
        console.error(error)
        clearTimeout(timeout)
        app.exit(1)
    }
})
