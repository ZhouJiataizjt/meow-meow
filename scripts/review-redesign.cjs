// Preview redesign with isolated, representative data and verify profile persistence.
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
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
 ipcMain.removeHandler('get_public_observations')
 ipcMain.handle('get_public_observations', async (_event, offset) => offset === 100
  ? { items: [{ ...mapRecords[0], kind: 'map_records' }], nextOffset: null }
  : { items: [{ ...records[0], kind: 'records', notes: '在草坪边遇到。', profiles: { username: '测试猫友' } }], nextOffset: 100 })
 for(const width of [1280,760]) {
  win.setSize(width,900)
  for(const route of ['records','public-records','cats','stats','assistant','profile','map']) {
   await win.webContents.executeJavaScript(`appNavigate('${route}')`); await delay(route==='map'?1300:400)
   const frame=win.webContents.mainFrame.frames[0]
   const metrics=await frame.executeJavaScript(`(async()=>{await Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(i=>i.decode().catch(()=>{})));return {width:innerWidth,scroll:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>i.getAttribute('src')&&!i.naturalWidth).map(i=>i.src)}})()`)
   assert.ok(metrics.scroll<=metrics.width,`${route} overflows at ${width}: ${JSON.stringify(metrics)}`)
   assert.deepEqual(metrics.broken,[],`${route} broken icons`)
   report.push({width,route,...metrics})
   fs.writeFileSync(path.join(output,`${route}-${width}.png`),(await win.webContents.capturePage()).toPNG())
  }
 }
 await win.webContents.executeJavaScript(`appNavigate('public-records')`); await delay(350)
 const publicFrame = win.webContents.mainFrame.frames[0]
 assert.match(await publicFrame.executeJavaScript(`document.getElementById('records_body').textContent`), /测试猫友/)
 await publicFrame.executeJavaScript(`document.getElementById('records-more').click()`)
 await delay(150)
 assert.equal(await publicFrame.executeJavaScript(`document.querySelectorAll('#records_body tr').length`), 2)
 assert.equal(await publicFrame.executeJavaScript(`document.querySelectorAll('.editBtn,.delBtn').length`), 0)
 await win.webContents.executeJavaScript(`appNavigate('assistant')`); await delay(350)
 const assistant = win.webContents.mainFrame.frames[0]
 await assistant.executeJavaScript(`document.getElementById('recent').click(); document.getElementById('ask-form').requestSubmit()`)
 await delay(150)
 assert.match(await assistant.executeJavaScript(`document.getElementById('assistant-status').textContent`), /本地模式/)
 ipcMain.removeHandler('ask_cat_assistant')
 ipcMain.handle('ask_cat_assistant', async () => ({
  answer: '大橘曾在图书馆草坪出现[1]。',
  sources: [{ reference: 1, ...mapRecords[0], location: '图书馆草坪', observedAt: mapRecords[0].time }]
 }))
 await assistant.executeJavaScript(`document.getElementById('ask-form').requestSubmit()`)
 await delay(150)
 assert.match(await assistant.executeJavaScript(`document.getElementById('answer').textContent`), /图书馆草坪/)
 fs.writeFileSync(path.join(output,'assistant-answer.png'),(await win.webContents.capturePage()).toPNG())
 await assistant.executeJavaScript(`document.querySelector('#sources button').click()`)
 await delay(1200)
 assert.equal(await win.webContents.mainFrame.frames[0].executeJavaScript(`Boolean(map._popup?.isOpen())`),true)
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
 await recordsFrame.executeJavaScript(`(async () => {
   await ipcRenderer.invoke('add_record', { species: '待补地点' })
   await ipcRenderer.invoke('add_record', { species: '待删除地点' })
   searchField.value = recordSource.value = 'all'
   searchInput.value = ''
   locationStatus.value = 'missing'
   await loadRecords()
 })()`)
 assert.equal(await recordsFrame.executeJavaScript(`document.querySelectorAll('#records_body tr').length`), 2)
 await recordsFrame.executeJavaScript(`document.querySelector('.editBtn').click(); document.getElementById('edit-location').value='图书馆西门'; saveEdit()`)
 await delay(250)
 assert.equal(await recordsFrame.executeJavaScript(`document.querySelectorAll('#records_body tr').length`), 1)
 await recordsFrame.executeJavaScript(`window.confirm = () => true; document.querySelector('.delBtn').click()`)
 await delay(250)
 assert.equal(await recordsFrame.executeJavaScript(`document.querySelectorAll('#records_body tr').length`), 0)
 const savedOrdinary = JSON.parse(fs.readFileSync(path.join(directory,'data/records.json'),'utf8'))
 const repaired = savedOrdinary.find(row => row.location === '图书馆西门')
 assert.ok(repaired)
 await recordsFrame.executeJavaScript(`ipcRenderer.invoke('delete_record', { id: ${JSON.stringify(repaired.id)} })`)
 await win.webContents.executeJavaScript(`appNavigate('cats')`); await delay(350)
 let catsFrame=win.webContents.mainFrame.frames[0]
 await catsFrame.executeJavaScript(`document.getElementById('cat-search').value='大橘'; document.getElementById('cat-search').dispatchEvent(new Event('input'))`)
 assert.equal(await catsFrame.executeJavaScript(`document.querySelectorAll('.cat-card').length`),1)
 await catsFrame.executeJavaScript(`showCatDetail('cat-orange'); editCurrentCat(); setCatAvatar('builtin:cat2'); saveCat()`)
 await delay(300)
 assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'data/cats.json'),'utf8'))[0].avatar,'builtin:cat2')
 const avatarFile=path.join(directory,'avatar.png')
 const avatarData = await win.webContents.executeJavaScript(`(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d');
    context.fillStyle = '#367f83';
    context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
 })()`)
 fs.writeFileSync(avatarFile,Buffer.from(avatarData,'base64'))
 await catsFrame.executeJavaScript(`openCatForm(cats.find(cat=>cat.id==='cat-orange')); setCatAvatar(${JSON.stringify(avatarFile)}); saveCat()`)
 await delay(300)
 const avatarCat=JSON.parse(fs.readFileSync(path.join(directory,'data/cats.json'),'utf8'))[0]
 assert.equal(avatarCat.id,'cat-orange');assert.ok(fs.existsSync(avatarCat.avatar));assert.notEqual(avatarCat.avatar,avatarFile)
 await catsFrame.executeJavaScript(`showCatDetail('cat-orange'); document.querySelector('.timeline-locate').click()`)
 await delay(1200)
 let mapFrame=win.webContents.mainFrame.frames[0]
 assert.equal(await mapFrame.executeJavaScript(`locatedHighlight !== null`),true)
 assert.equal(await mapFrame.executeJavaScript(`Boolean(map._popup?.isOpen())`),true)
 const target=await mapFrame.executeJavaScript(`(async () => {
   for (let attempt = 0; attempt < 30 && map.getZoom() !== 18; attempt++) {
     await new Promise(resolve => setTimeout(resolve, 100))
   }
   return {lat:map.getCenter().lat,lng:map.getCenter().lng,zoom:map.getZoom()}
 })()`)
 assert.equal(target.zoom,18);assert.ok(Math.abs(target.lat-23.05)<.002)
 await mapFrame.executeJavaScript(`document.getElementById('trajectory-btn').click();
    const option = [...trajectorySelect.options].find(option => option.text.startsWith('月亮'));
    trajectorySelect.value = option.value; trajectorySelect.dispatchEvent(new Event('change'));`)
 assert.deepEqual(await mapFrame.executeJavaScript(`(() => {
    const line = trajectoryLayer.getLayers()[0];
    const points = line.getLatLngs();
    return { count: points.length, ordered: points[0].lat < points[1].lat && points[1].lat < points[2].lat, markers: markers.length };
 })()`), { count: 3, ordered: true, markers: 3 })
 await delay(180)
 fs.writeFileSync(path.join(output,'map-trajectory.png'),(await win.webContents.capturePage()).toPNG())
 await mapFrame.executeJavaScript(`document.getElementById('trajectory-close').click()`)
 assert.equal(await mapFrame.executeJavaScript(`trajectoryLayer.getLayers().length === 0 && markers.length === allRecords.length`),true)
 await win.webContents.executeJavaScript(`appNavigate('public-records')`); await delay(300)
 const publicMapFrame = win.webContents.mainFrame.frames[0]
 await publicMapFrame.executeJavaScript(`loadRecords(true)`)
 await publicMapFrame.executeJavaScript(`document.querySelector('.locateBtn').click()`)
 await delay(400)
 mapFrame = win.webContents.mainFrame.frames[0]
 assert.equal(await mapFrame.executeJavaScript(`locatedHighlight?.getLatLng().lat`), mapRecords[0].lat)
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
 for (const width of [480, 1280]) {
  win.setSize(width, 900); await delay(180)
  assert.equal(await statsFrame.executeJavaScript(`(() => {
    const chart = document.querySelector('.month-chart').getBoundingClientRect();
    return [...document.querySelectorAll('.month-col')].every(column => {
      const rect = column.getBoundingClientRect();
      return rect.left >= chart.left && rect.right <= chart.right + 1;
    }) && [...document.querySelectorAll('.bar-fill')].every(bar =>
      bar.closest('.bar-row').querySelector('.bar-count').textContent !== '0' || bar.getBoundingClientRect().width === 0);
  })()`),true)
 }
 await statsFrame.executeJavaScript(`document.getElementById('include-demo').checked=false; loadStats()`)
 assert.equal(await statsFrame.executeJavaScript(`document.querySelectorAll('.stat-value')[1].textContent`),'18')
 await statsFrame.executeJavaScript(`document.getElementById('include-demo').checked=true; loadStats()`)
 win.setSize(1280,900)
 for(const [name,scroll] of [['activity',0],['donuts',800],['heatmap',1250],['campuses',2200]]) {
  await statsFrame.executeJavaScript(`window.scrollTo(0,${scroll})`);await delay(120)
  fs.writeFileSync(path.join(output,`stats-${name}.png`),(await win.webContents.capturePage()).toPNG())
 }
 await statsFrame.executeJavaScript(`document.getElementById('month-chart').closest('.stats-section').scrollIntoView({block:'center'})`)
 await delay(180)
 fs.writeFileSync(path.join(output,'stats-monthly.png'),(await win.webContents.capturePage()).toPNG())
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
 const showOpenDialog = dialog.showOpenDialog
 dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [process.env.MEOW_UI_FIXTURE_PHOTO || avatarFile] })
 await frame.executeJavaScript(`document.getElementById('profile-avatar-select').click()`)
 await delay(200)
 dialog.showOpenDialog = showOpenDialog
 assert.equal(await frame.executeJavaScript(`Boolean(draftAvatar?.startsWith('data:image/jpeg')) && !saveButton.disabled`), true)
 await frame.executeJavaScript(`document.getElementById('profile-save').click()`)
 await delay(220)
 const savedProfile = JSON.parse(fs.readFileSync(path.join(directory,'observer-profile.json'),'utf8'))
 assert.match(savedProfile.profile.avatar_url, /^data:image\/jpeg;base64,/)
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#account-avatar img').src`), savedProfile.profile.avatar_url)
 win.setSize(480, 650)
 await win.webContents.executeJavaScript(`appNavigate('profile')`); await delay(250)
 frame = win.webContents.mainFrame.frames[0]
 assert.equal(await frame.executeJavaScript(`document.getElementById('identity-avatar').src`), savedProfile.profile.avatar_url)
 fs.writeFileSync(path.join(output,'profile-avatar-compact.png'),(await win.webContents.capturePage()).toPNG())
 await frame.executeJavaScript(`document.getElementById('profile-avatar-reset').click(); document.getElementById('profile-save').click()`)
 await delay(220)
 assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'observer-profile.json'),'utf8')).profile.avatar_url, null)
 const defaultAvatar = await win.webContents.executeJavaScript(`document.querySelector('#account-avatar img').src`)
 assert.match(defaultAvatar, /cat-avatars\/[a-z]+\.svg$/)
 assert.equal(await frame.executeJavaScript(`document.getElementById('identity-avatar').src`), defaultAvatar)

 ipcMain.removeHandler('is-social-enabled')
 ipcMain.handle('is-social-enabled', async () => true)
 ipcMain.removeHandler('get_record_interactions')
 ipcMain.handle('get_record_interactions', async () => ({
  likes: 2, is_liked: false,
  comments: [{ id: 'fixture', content: '在图书馆门口遇到，靠在台阶边休息。', created_at: '2026-11-11T10:00:00', profiles: { username: '猫咪观察员' } }]
 }))
 win.setSize(480, 650)
 await win.webContents.executeJavaScript(`appNavigate('map')`); await delay(900)
 const detailFrame = win.webContents.mainFrame.frames[0]
 const fixturePhoto = process.env.MEOW_UI_FIXTURE_PHOTO || path.resolve('src/frontend/assets/cat-avatars/apricot.svg')
 await detailFrame.executeJavaScript(`(async () => {
   await initialRecords
   catProfiles.find(cat => cat.id === allRecords[0].cat_id).avatar = 'builtin:cat2'
   allRecords[0].images = [${JSON.stringify(fixturePhoto)}]
   allRecords[1].images = [${JSON.stringify(path.join(directory, 'missing-photo.png'))}]
   renderMarkers(allRecords)
   showDetailModal(allRecords[0])
 })()`)
 await delay(300)
 const detailMetrics = await detailFrame.executeJavaScript(`(() => {
   const modal = document.querySelector('.detail-content')
   const body = modal.querySelector('.detail-info')
   const photo = markers.find(marker => marker.recordId === allRecords[0].id).getElement().querySelector('img')
   const missing = markers.find(marker => marker.recordId === allRecords[1].id).getElement().querySelector('img')
   const footer = modal.querySelector('.detail-actions')
   const before = footer.getBoundingClientRect().bottom
   body.scrollTop = body.scrollHeight
   const after = footer.getBoundingClientRect().bottom
   body.scrollTop = 0
   return { loaded: photo.naturalWidth > 0 && photo.src.endsWith('/cat-avatars/blue.svg'),
     markerSized: photo.offsetWidth <= photo.parentElement.clientWidth && photo.offsetHeight <= photo.parentElement.clientHeight,
     fallback: missing.naturalWidth > 0 && missing.src.includes('cat-avatars/'),
     footerFixed: before === after && after <= innerHeight,
     singlePhoto: document.getElementById('detail-gallery').hidden,
     comment: document.querySelector('.comment-content').textContent }
 })()`)
 assert.deepEqual(detailMetrics, { loaded: true, markerSized: true, fallback: true, footerFixed: true, singlePhoto: true, comment: '在图书馆门口遇到，靠在台阶边休息。' })
 fs.writeFileSync(path.join(output,'map-detail-compact.png'),(await win.webContents.capturePage()).toPNG())
 await detailFrame.executeJavaScript(`(() => {
    const record = allRecords[0]
    showDetailModal({ ...record, images: [record.images[0], '../assets/cat-avatars/mint.svg'] })
    document.querySelector('#detail-gallery button:nth-child(2)').click()
    document.querySelector('.detail-photo').click()
 })()`)
 assert.equal(await detailFrame.executeJavaScript(`document.querySelector('#lightbox img').getAttribute('src')`), '../assets/cat-avatars/mint.svg')
 await detailFrame.executeJavaScript(`closeLightbox(); document.querySelector('.detail-location').click()`)
 assert.equal(await detailFrame.executeJavaScript(`locatedHighlight?.getLatLng().lat === allRecords[0].lat && map.getZoom() === 18`),true)
 await delay(180)
 fs.writeFileSync(path.join(output,'map-avatar-pins-compact.png'),(await win.webContents.capturePage()).toPNG())
 await detailFrame.executeJavaScript(`showRecordsList()`)
 await delay(220)
 fs.writeFileSync(path.join(output,'map-observations-compact.png'),(await win.webContents.capturePage()).toPNG())
 await detailFrame.executeJavaScript(`document.getElementById('list-filter-toggle').click();
    document.getElementById('cluster-mode').checked = true; onFilterChanged()`)
 assert.equal(await detailFrame.executeJavaScript(`document.getElementById('list-filter-count').textContent`), '1')
 assert.equal(await detailFrame.executeJavaScript(`observationList.scrollWidth <= observationList.clientWidth`), true)
 await detailFrame.executeJavaScript(`listContent.querySelector('button').click()`)
 assert.equal(await detailFrame.executeJavaScript(`document.getElementById('list-cluster-back').hidden`), false)
 await detailFrame.executeJavaScript(`document.getElementById('list-cluster-back').click(); clearObservationFilters()`)
 await detailFrame.executeJavaScript(`document.getElementById('list-search-input').value='大橘'; onFilterChanged()`)
 assert.ok(await detailFrame.executeJavaScript(`listContent.querySelectorAll('button').length > 0`))
 await detailFrame.executeJavaScript(`clearObservationFilters(); document.getElementById('list-filter-toggle').click()`)
 win.setSize(1280, 900)
 await delay(250)
 fs.writeFileSync(path.join(output,'map-observations-wide.png'),(await win.webContents.capturePage()).toPNG())
 win.setSize(480, 650)
 await win.webContents.executeJavaScript(`appNavigate('cats')`); await delay(350)
 const avatarFrame = win.webContents.mainFrame.frames[0]
 await avatarFrame.executeJavaScript(`openCatForm(cats[1]); document.querySelector('[data-avatar="builtin:mint"]').click()`)
 await delay(200)
 assert.equal(await avatarFrame.executeJavaScript(`getComputedStyle(document.getElementById('cat-form-mask')).display`), 'flex')
 const avatars = await avatarFrame.executeJavaScript(`Array.from(document.querySelectorAll('.avatar-choice img'), image => image.naturalWidth > 0)`)
 assert.deepEqual(avatars, [true, true, true, true, true, true])
 fs.writeFileSync(path.join(output,'cat-avatar-picker-compact.png'),(await win.webContents.capturePage()).toPNG())
 await avatarFrame.executeJavaScript(`saveCat()`)
 await delay(300)
 assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'data/cats.json'),'utf8'))[1].avatar,'builtin:mint')
 await win.webContents.executeJavaScript(`ipcRenderer.invoke('open_login_window')`)
 await delay(350)
 const login = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/login.html'))
 assert.ok(login)
 assert.equal(await login.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-mode="register"]').click();
    const registerReady = password.minLength === 8 && password.autocomplete === 'new-password';
    document.querySelector('[data-mode="login"]').click();
    return registerReady && password.autocomplete === 'current-password' && form.scrollWidth === form.clientWidth;
 })()`),true)
 fs.writeFileSync(path.join(output,'login.png'),(await login.webContents.capturePage()).toPNG())
 login.close()
 ipcMain.removeHandler('is-cloud-enabled')
 ipcMain.handle('is-cloud-enabled', async () => true)
 ipcMain.handle('get-cloud-status', async () => true)
 win.setSize(1024, 800)
 await win.webContents.executeJavaScript(`refreshAccount()`)
 assert.equal(await win.webContents.executeJavaScript(`accountCard.classList.contains('is-guest') && editProfile.hidden`),true)
 fs.writeFileSync(path.join(output,'account-guest.png'),(await win.webContents.capturePage()).toPNG())
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2))
 console.log(`PASS: ${report.length} responsive views, one-click map location, chronological cat tracks, observation filters, avatar persistence and reset, login modes, assistant citations, records editing and chart alignment`)
 app.exit(0)
 } catch(error){console.error(error);app.exit(1)}
})
