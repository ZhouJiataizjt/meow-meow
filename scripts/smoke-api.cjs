// Real Electron -> public IP -> Node API -> MySQL. No credentials are printed.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meow-api-smoke-'))
app.setPath('userData', directory)
delete process.env.MEOW_ENABLE_CLOUD
delete process.env.MEOW_LOCAL_MODE
delete process.env.MEOW_API_URL
require('../src/frontend/js/main')
app.whenReady().then(async () => {
    let id
    try {
        await new Promise(resolve => setTimeout(resolve, 1500))
        const win = BrowserWindow.getAllWindows()[0]
        const result = await win.webContents.executeJavaScript(`(async () => {
            const ipc = require('electron').ipcRenderer;
            const crypto = require('node:crypto');
            const account = await ipc.invoke('auth-register', { email: 'desktop-' + crypto.randomBytes(12).toString('hex') + '@example.invalid', password: crypto.randomBytes(24).toString('hex') });
            if (!account.success) throw new Error(account.error);
            window.testCloudUser = account.user.id;
            const cat = await ipc.invoke('add_cat', { name: '桌面云端验证猫', features: '左耳白毛' });
            const image = require('node:path').join(${JSON.stringify(directory)}, 'test.png');
            require('node:fs').writeFileSync(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V0AAAAASUVORK5CYII=', 'base64'));
            const record = await ipc.invoke('add_map_record', { title:'桌面上传验证',lat:23.05,lng:113.4,cat_id:cat.id,images:[image] });
            const records = await ipc.invoke('get_map_records');
            const downloaded = records.find(row => row.id === record.id);
            if (!downloaded || !require('node:fs').existsSync(downloaded.image)) throw new Error('照片未下载到桌面缓存');
            await ipc.invoke('update_map_record', { id:record.id,record:{...downloaded,title:'修改后'} });
            const updated = (await ipc.invoke('get_map_records')).find(row => row.id === record.id);
            if (updated.title !== '修改后' || updated.cat_id !== cat.id) throw new Error('更新或档案关联失败');
            await ipc.invoke('toggle_like', record.id);
            await ipc.invoke('add_comment', { recordId:record.id,content:'真实桌面评论验证' });
            const social = await ipc.invoke('get_record_interactions', record.id);
            if (!social.is_liked || social.likes !== 1 || social.comments.length !== 1) throw new Error('点赞评论失败');
            await refreshAccount();
            await new Promise(resolve => setTimeout(resolve, 1200));
            const mapFrame = document.getElementById('workspace-frame').contentWindow;
            await mapFrame.loadMapRecords();
            mapFrame.showDetailModalById(record.id);
            await mapFrame.loadInteractions(record.id);
            if (mapFrame.document.querySelector('.interaction-bar').style.display === 'none') throw new Error('点赞区域不可见');
            if (!mapFrame.document.querySelector('.comment-content')?.textContent.includes('真实桌面评论验证')) throw new Error('地图详情未显示评论');
            await ipc.invoke('delete_comment',social.comments[0].id);
            await ipc.invoke('toggle_like',record.id);
            await ipc.invoke('delete_map_record', {id:record.id});
            await ipc.invoke('delete_cat',cat.id);
            const empty = !(await ipc.invoke('get_map_records')).some(row => row.id === record.id);
            await ipc.invoke('auth-logout');
            return { userId:account.user.id, empty, loggedOut:await ipc.invoke('get-current-user') === null };
        })()`)
        id = result.userId
        assert.ok(result.empty && result.loggedOut)
        fs.writeFileSync(path.resolve('artifacts/api-desktop-test.json'), JSON.stringify({ userId: id }))
        console.log('PASS: Electron registration, cat association, photo upload/cache, record update/delete, likes/comments and logout')
        app.exit(0)
    } catch (error) {
        const win = BrowserWindow.getAllWindows()[0]
        if (!id && win) id = await win.webContents.executeJavaScript('window.testCloudUser').catch(() => null)
        if (id) fs.writeFileSync(path.resolve('artifacts/api-desktop-test.json'), JSON.stringify({ userId: id }))
        console.error(error.message)
        app.exit(1)
    }
})
