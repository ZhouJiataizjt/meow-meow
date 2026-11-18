// Preview redesign with isolated, representative data and verify profile persistence.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meow-redesign-'))
app.setPath('userData', directory)
process.env.MEOW_LOCAL_MODE = '1'
fs.mkdirSync(path.join(directory, 'data'))
const cats = [
 {id:'cat-orange',name:'大橘',species:'橘白猫',features:'鼻尖有一小块白色',created_at:'2026-10-01'},
 {id:'cat-moon',name:'月亮',species:'奶牛猫',features:'尾巴尖是白色',created_at:'2026-10-02'},
 {id:'cat-black',name:'小煤球',species:'黑猫',features:'胸前有白毛',created_at:'2026-10-03'}
]
const records = Array.from({length:9},(_,i)=>({id:'record-'+i,cat_id:cats[i%3].id,time:`2026-${String(9+i%3).padStart(2,'0')}-${String(3+i).padStart(2,'0')}T15:30`,location:['图书馆草坪','教学楼连廊','宿舍楼下'][i%3],species:cats[i%3].species,count:i%2+1,gender:'安静、亲人',area:'广州大学·大学城校区'}))
const mapRecords=records.map((r,i)=>({...r,title:cats[i%3].name+'的午后',desc:'躲在树荫下休息，精神状态很好。',lat:23.05+i*.0002,lng:113.39+i*.0002,created_at:r.time,images:[]}))
for(const [name,data] of Object.entries({cats,records,map_records:mapRecords})) fs.writeFileSync(path.join(directory,'data',name+'.json'),JSON.stringify(data))
require('../src/frontend/js/main')
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
app.whenReady().then(async()=>{
 try {
 await delay(1600)
 const win=BrowserWindow.getAllWindows()[0]
 const output=path.resolve('artifacts/ui/light-redesign'); fs.mkdirSync(output,{recursive:true})
 const report=[]
 for(const width of [1280,760]) {
  win.setSize(width,900)
  for(const route of ['records','cats','stats','guide','guide-name','guide-area','recommend','profile','map']) {
   await win.webContents.executeJavaScript(`appNavigate('${route}')`); await delay(route==='map'?1300:400)
   const frame=win.webContents.mainFrame.frames[0]
   const metrics=await frame.executeJavaScript(`(async()=>{await Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(i=>i.decode().catch(()=>{})));return {width:innerWidth,scroll:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>i.getAttribute('src')&&!i.naturalWidth).map(i=>i.src)}})()`)
   assert.ok(metrics.scroll<=metrics.width,`${route} overflows at ${width}: ${JSON.stringify(metrics)}`)
   assert.deepEqual(metrics.broken,[],`${route} broken icons`)
   report.push({width,route,...metrics})
   fs.writeFileSync(path.join(output,`${route}-${width}.png`),(await win.webContents.capturePage()).toPNG())
  }
 }
 await win.webContents.executeJavaScript(`appNavigate('records')`); await delay(400)
 let recordsFrame=win.webContents.mainFrame.frames[0]
 assert.equal(await recordsFrame.executeJavaScript(`records.length`),18)
 await recordsFrame.executeJavaScript(`recordSource.value='map'; recordSource.dispatchEvent(new Event('change')); searchField.value='location'; searchInput.value='大橘'; searchInput.dispatchEvent(new Event('input'))`)
 assert.equal(await recordsFrame.executeJavaScript(`document.querySelectorAll('#records_body tr').length`),3)
 await recordsFrame.executeJavaScript(`document.querySelector('th[data-field="time"]').click()`)
 assert.equal(await recordsFrame.executeJavaScript(`document.querySelectorAll('#records_body tr').length`),3)
 await recordsFrame.executeJavaScript(`document.querySelector('.editBtn').click(); document.getElementById('edit-location').value='修改后的地图标题'; document.getElementById('edit-description').value='地图描述仍可修改'; saveEdit()`)
 await delay(350)
 const savedMap=JSON.parse(fs.readFileSync(path.join(directory,'data/map_records.json'),'utf8'))
 assert.ok(savedMap.some(row=>row.title==='修改后的地图标题' && row.desc==='地图描述仍可修改' && row.lat===23.05))
 assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'data/records.json'),'utf8'))[0].location,'图书馆草坪')
 await win.webContents.executeJavaScript(`appNavigate('cats')`); await delay(350)
 let catsFrame=win.webContents.mainFrame.frames[0]
 await catsFrame.executeJavaScript(`document.getElementById('cat-search').value='大橘'; document.getElementById('cat-search').dispatchEvent(new Event('input'))`)
 assert.equal(await catsFrame.executeJavaScript(`document.querySelectorAll('.cat-card').length`),1)
 await catsFrame.executeJavaScript(`showCatDetail('cat-orange'); editCurrentCat(); setCatAvatar('builtin:cat2'); saveCat()`)
 await delay(300)
 assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'data/cats.json'),'utf8'))[0].avatar,'builtin:cat2')
 const avatarFile=path.join(directory,'avatar.png')
 fs.writeFileSync(avatarFile,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V0AAAAASUVORK5CYII=','base64'))
 await catsFrame.executeJavaScript(`openCatForm(cats.find(cat=>cat.id==='cat-orange')); setCatAvatar(${JSON.stringify(avatarFile)}); saveCat()`)
 await delay(300)
 const avatarCat=JSON.parse(fs.readFileSync(path.join(directory,'data/cats.json'),'utf8'))[0]
 assert.equal(avatarCat.id,'cat-orange');assert.ok(fs.existsSync(avatarCat.avatar));assert.notEqual(avatarCat.avatar,avatarFile)
 await catsFrame.executeJavaScript(`showCatDetail('cat-orange'); document.querySelector('.timeline-locate').click()`)
 await delay(1200)
 let mapFrame=win.webContents.mainFrame.frames[0]
 assert.equal(await mapFrame.executeJavaScript(`locatedHighlight !== null`),true)
 assert.equal(await mapFrame.executeJavaScript(`Boolean(map._popup?.isOpen())`),true)
 const target=await mapFrame.executeJavaScript(`({lat:map.getCenter().lat,lng:map.getCenter().lng,zoom:map.getZoom()})`)
 assert.equal(target.zoom,18);assert.ok(Math.abs(target.lat-23.05)<.002)
 await win.webContents.executeJavaScript(`appNavigate('stats')`); await delay(350)
 let statsFrame=win.webContents.mainFrame.frames[0]
 const seeded=await statsFrame.executeJavaScript(`ipcRenderer.invoke('seed_campus_demo')`)
 assert.equal(seeded.added,27);assert.equal(seeded.campuses,9)
 assert.equal((await statsFrame.executeJavaScript(`ipcRenderer.invoke('seed_campus_demo')`)).added,0)
 await statsFrame.executeJavaScript(`loadStats()`)
 assert.equal(await statsFrame.executeJavaScript(`document.querySelectorAll('.stat-value')[1].textContent`),'45')
 assert.equal(await statsFrame.executeJavaScript(`document.querySelectorAll('#activity-heatmap tbody tr').length`),7)
 assert.equal(await statsFrame.executeJavaScript(`document.querySelectorAll('#activity-heatmap tbody td').length`),168)
 const monthly=await statsFrame.executeJavaScript(`Array.from(document.querySelectorAll('.month-bar'), bar => ({ count:Number(bar.textContent), height:bar.getBoundingClientRect().height }))`)
 const tallest=monthly.reduce((maximum, bar) => bar.count > maximum.count ? bar : maximum)
 assert.ok(tallest.height > 0 && monthly.every(bar => Math.abs(bar.height - tallest.height * bar.count / tallest.count) < 1))
 await statsFrame.executeJavaScript(`document.getElementById('include-demo').checked=false; loadStats()`)
 assert.equal(await statsFrame.executeJavaScript(`document.querySelectorAll('.stat-value')[1].textContent`),'18')
 await statsFrame.executeJavaScript(`document.getElementById('include-demo').checked=true; loadStats()`)
 win.setSize(1280,900)
 for(const [name,scroll] of [['activity',0],['donuts',800],['heatmap',1250],['campuses',2200]]) {
  await statsFrame.executeJavaScript(`window.scrollTo(0,${scroll})`);await delay(120)
  fs.writeFileSync(path.join(output,`stats-${name}.png`),(await win.webContents.capturePage()).toPNG())
 }
 await win.webContents.executeJavaScript(`appNavigate('profile')`); await delay(300)
 let frame=win.webContents.mainFrame.frames[0]
 const initial=await frame.executeJavaScript(`document.getElementById('profile-id').value`)
 assert.ok(initial)
 assert.equal(await frame.executeJavaScript(`document.getElementById('profile-id').readOnly`),true)
 await frame.executeJavaScript(`nameField.value='小橘的朋友'; nameField.dispatchEvent(new Event('input')); document.getElementById('profile-save').click()`)
 await delay(250)
 assert.equal(await frame.executeJavaScript(`message.textContent`),'已保存')
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('account-name').textContent`),'小橘的朋友')
 await win.webContents.executeJavaScript(`appNavigate('profile')`); await delay(250)
 frame=win.webContents.mainFrame.frames[0]
 assert.equal(await frame.executeJavaScript(`nameField.value`),'小橘的朋友')
 assert.equal(await frame.executeJavaScript(`document.getElementById('profile-id').value`),initial)
 const tampered=await frame.executeJavaScript(`ipcRenderer.invoke('update_profile',{id:'tampered',username:'should fail'})`)
 assert.equal(tampered.success,false)
 const stored=JSON.parse(fs.readFileSync(path.join(directory,'observer-profile.json'),'utf8'))
 assert.equal(stored.id,initial); assert.equal(stored.profile.username,'小橘的朋友')
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2))
 console.log('PASS: 18 responsive views, own map records, field/source filters, filtered sorting, map edit routing and immutable profile ID; avatar photo/built-in persistence, cat search, map navigation, 27-point seed idempotence and chart filters')
 app.exit(0)
 } catch(error){console.error(error);app.exit(1)}
})
