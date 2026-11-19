const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const foreign = {id:'creator-uuid~cat-uuid',name:'年糕',species:'橘白猫',features:'左耳有缺角，四只白爪',is_mine:false}
let saved
app.on('window-all-closed', () => {})
ipcMain.handle('get_cats', () => [])
ipcMain.handle('get_map_records', () => [])
ipcMain.handle('is-cloud-enabled', () => true)
ipcMain.handle('search_cats', async (_event, term) => {
 if (term === '慢搜索') { await new Promise(r=>setTimeout(r,650)); return {items:[{...foreign,id:'stale',name:'旧结果'}],nextOffset:null} }
 if (term === '失败') throw Error('网络不可用')
 return {items: term === '没有' ? [] : [foreign],nextOffset:null}
})
ipcMain.handle('add_record', (_event, record) => {saved=record;return {...record,id:'saved'}})
const delay = ms => new Promise(resolve => setTimeout(resolve,ms))
app.whenReady().then(async()=>{
 try {
 const win = new BrowserWindow({show:false,width:800,height:920,webPreferences:{nodeIntegration:true,contextIsolation:false}})
 await win.loadFile(path.resolve('src/frontend/html/add_record.html'))
 const type = async text => {
  await win.webContents.executeJavaScript(`document.querySelector('[data-cat-search]').value=${JSON.stringify(text)};document.querySelector('[data-cat-search]').dispatchEvent(new Event('input'))`)
  await delay(320)
 }
 await type('年糕')
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[data-cat-select]').options.length`),2)
 await win.webContents.executeJavaScript(`document.querySelector('[data-cat-select]').value='creator-uuid~cat-uuid';document.querySelector('[data-cat-select]').dispatchEvent(new Event('change'))`)
 assert.equal(await win.webContents.executeJavaScript('catPicker.value'),foreign.id)
 await type('没有')
 assert.equal(await win.webContents.executeJavaScript('catPicker.value'),foreign.id,'Search must preserve selection')
 await type('慢搜索');await type('年糕');await delay(400)
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[data-cat-select]').textContent.includes('旧结果')`),false,'Stale search must not replace latest results')
 await type('失败')
 assert.match(await win.webContents.executeJavaScript(`document.querySelector('[data-cat-status]').textContent`),/搜索失败/)
 await type(foreign.id)
 fs.mkdirSync('artifacts/ui/shared-cats',{recursive:true})
 for (const width of [800,500]) {
  win.setSize(width,920);await delay(100)
  assert.equal(await win.webContents.executeJavaScript('document.documentElement.scrollWidth > innerWidth'),false,'Form overflows')
  fs.writeFileSync(`artifacts/ui/shared-cats/picker-${width}.png`,(await win.webContents.capturePage()).toPNG())
 }
 await win.webContents.executeJavaScript(`document.getElementById('location').value='图书馆';document.getElementById('species').value='橘白猫';document.getElementById('gender').value='白爪';document.getElementById('recordForm').requestSubmit()`)
 await delay(200)
 assert.equal(saved.cat_id,foreign.id,'Observation must retain shared ID')
 ipcMain.removeHandler('get_cats')
 ipcMain.handle('get_cats',()=>[foreign])
 ipcMain.handle('get_records',()=>[saved])
 ipcMain.handle('get_own_map_records',()=>[])
 const archive = new BrowserWindow({show:false,width:800,height:920,webPreferences:{nodeIntegration:true,contextIsolation:false}})
 await archive.loadFile(path.resolve('src/frontend/html/cats.html'));await delay(150)
 await archive.webContents.executeJavaScript(`showCatDetail('creator-uuid~cat-uuid')`)
 assert.equal(await archive.webContents.executeJavaScript(`getComputedStyle(document.querySelector('[onclick="editCurrentCat()"]')).display`),'none','Shared cat must be read only')
 assert.equal(await archive.webContents.executeJavaScript(`getComputedStyle(document.querySelector('[onclick="deleteCat()"]')).display`),'none','Shared cat must not expose deletion')
 assert.equal(await archive.webContents.executeJavaScript(`document.querySelectorAll('.timeline-item').length`),1,'Own sighting must enter shared profile timeline')
 fs.writeFileSync('artifacts/ui/shared-cats/shared-profile.png',(await archive.webContents.capturePage()).toPNG())
 console.log('PASS shared profile read-only controls and own observation timeline')
 console.log('PASS shared cat search, ID selection, retained selection, stale response, retry, narrow layout, and saved association')
 app.exit(0)
 }catch(error){console.error(error);app.exit(1)}
})
