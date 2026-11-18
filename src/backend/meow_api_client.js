const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { URL } = require('node:url')
const { avatarPresets } = require('./cat_avatars')
/* global AbortSignal */

// Default cloud endpoint. Local mode must be explicitly requested for offline use.
function installMeowApi({ ipcMain, app, dialog, safeStorage, compressImageForUpload }) {
    if (process.env.MEOW_LOCAL_MODE === '1') return
    const endpoint = process.env.MEOW_API_URL || 'http://8.148.216.205/meow-api'
    const base = new URL(endpoint)
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('无效的喵喵 API 地址')
    let session = null
    const statePath = path.join(app.getPath('userData'), 'meow-api-session.bin')
    const cacheDir = path.join(app.getPath('userData'), 'meow-api-images')
    function saveSession() {
        if (!session) { if (fs.existsSync(statePath)) fs.unlinkSync(statePath); return }
        if (safeStorage.isEncryptionAvailable()) {
            fs.writeFileSync(statePath, safeStorage.encryptString(JSON.stringify({ endpoint, ...session })))
        }
    }
    const ready = app.whenReady().then(() => {
        if (safeStorage.isEncryptionAvailable() && fs.existsSync(statePath)) {
            try {
                const stored = JSON.parse(safeStorage.decryptString(fs.readFileSync(statePath)))
                if (stored.endpoint === endpoint) session = stored
            } catch { session = null }
        }
    })
    async function request(route, method = 'GET', data, binary = false) {
        await ready
        const headers = {}
        if (session?.token) headers.Authorization = `Bearer ${session.token}`
        const raw = Buffer.isBuffer(data)
        if (data !== undefined) headers['Content-Type'] = raw ? 'application/octet-stream' : 'application/json'
        const response = await fetch(new URL(base.href.replace(/\/$/, '') + route), {
            method, headers, body: data === undefined ? undefined : raw ? data : JSON.stringify(data),
            signal: AbortSignal.timeout(route === '/cat-assistant' ? 22000 : 15000), redirect: 'error'
        })
        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            if (response.status === 401) { session = null; saveSession() }
            const failure = new Error(error.error || `喵喵服务返回 ${response.status}`)
            failure.status = response.status
            throw failure
        }
        return binary ? Buffer.from(await response.arrayBuffer()) : response.json()
    }
    function handle(channel, fn) { ipcMain.removeHandler(channel); ipcMain.handle(channel, fn) }
    function requireLogin() { if (!session) throw new Error('请先登录喵喵云端账户') }
    handle('ask_cat_assistant', async (_event, question) => {
        try {
            await ready
            if (!session) return { error: '请先登录喵喵云端账户', needsLogin: true }
            return await request('/cat-assistant', 'POST', { question })
        } catch (error) {
            if ([404, 405].includes(error.status)) return { error: '当前云端服务尚未启用寻猫小助手' }
            if (error.status) return { error: error.message, needsLogin: error.status === 401 }
            return { error: '连接云端失败，请检查网络后重试' }
        }
    })
    async function prepare(record) {
        const copy = { ...record }
        if (copy._api_id) copy.id = copy._api_id
        delete copy._api_id; delete copy.cat_name
        const images = record.images || (record.image ? [record.image] : [])
        if (images.length > 6) throw new Error('每条观察最多上传 6 张图片')
        const uploaded = []
        for (const image of images) {
            if (typeof image !== 'string') continue
            if (image.startsWith('/uploads/')) { uploaded.push(image); continue }
            if (!fs.existsSync(image)) throw new Error('图片不存在，请重新选择')
            const name = path.basename(image)
            // Cached cloud images retain their original remote ID when editing.
            if (path.dirname(image) === cacheDir && /^[a-f0-9-]{36}$/.test(name)) { uploaded.push('/uploads/' + name); continue }
            const { buffer } = compressImageForUpload(image)
            if (buffer.length > 2 * 1024 * 1024) throw new Error('图片压缩后超过 2 MiB，请缩小后重试')
            uploaded.push((await request('/uploads', 'POST', buffer)).url)
        }
        if (record.images || record.image) { copy.images = uploaded; copy.image = uploaded[0] || '' }
        if (record.avatar && !avatarPresets.some(preset => preset.id === record.avatar)) {
            const avatar = await prepare({ images: [record.avatar] })
            copy.avatar = avatar.images[0] || ''
        }
        return copy
    }
    function mapIdentity(record) {
        return { ...record, _api_id: record._api_id || record.id,
            id: `${record.user_id}~${record._api_id || record.id}`, is_mine: record.user_id === session?.user.id }
    }
    async function withImages(record, kind) {
        const copy = kind === 'map_records' ? mapIdentity(record) : { ...record, is_mine: record.user_id === session?.user.id }
        const images = record.images || (record.image ? [record.image] : [])
        const avatarIsUpload = /^\/uploads\/[a-f0-9-]{36}$/.test(record.avatar || '')
        const downloads = avatarIsUpload ? [...images, record.avatar] : images
        const local = []
        for (const image of downloads) {
            if (!/^\/uploads\/[a-f0-9-]{36}$/.test(image)) continue
            const target = path.join(cacheDir, image.split('/').pop())
            fs.mkdirSync(cacheDir, { recursive: true })
            if (!fs.existsSync(target)) fs.writeFileSync(target, await request(image, 'GET', undefined, true))
            if (avatarIsUpload && image === record.avatar) copy.avatar = target
            else local.push(target)
        }
        if (images.length) { copy.images = local; copy.image = local[0] || '' }
        return copy
    }
    async function list(kind, images = true, mine = false) {
        await ready
        if (!session && (kind !== 'map_records' || mine)) return []
        let rows = []
        if (kind === 'map_records' && !mine) {
            let offset = 0
            do {
                const page = await request('/map_records?offset=' + offset)
                rows.push(...page.items)
                offset = page.nextOffset
            } while (offset !== null && offset <= 10000)
        } else rows = await request('/' + kind + (kind === 'map_records' ? '?mine=1' : ''))
        const result = []
        for (const row of rows) {
            const owned = kind === 'map_records' && mine ? { ...row, user_id: session.user.id } : row
            result.push(images ? await withImages(owned, kind) : owned)
        }
        return result
    }
    let seedingDemo = false
    handle('seed_campus_demo', async () => {
        await ready
        requireLogin()
        if (seedingDemo) throw new Error('示例记录正在添加，请稍候')
        seedingDemo = true
        try {
            await request('/auth/me')
            const { campusDemoData } = require('./campus_demo')
            const demo = campusDemoData()
            const cats = new Set((await list('cats', false, true)).map(row => row.id))
            const records = new Set((await list('map_records', false, true)).map(row => row.id))
            let added = 0
            for (const cat of demo.cats) if (!cats.has(cat.id)) {
                await request('/cats', 'POST', cat)
                await new Promise(resolve => setTimeout(resolve, 220))
            }
            for (const record of demo.records) if (!records.has(record.id)) {
                await request('/map_records', 'POST', record)
                added++
                await new Promise(resolve => setTimeout(resolve, 220))
            }
            return { added, total: demo.records.length, campuses: demo.campuses.length }
        } finally { seedingDemo = false }
    })
    handle('get_own_map_records', async () => list('map_records', true, true))
    handle('get_public_observations', async (_event, offset = 0) => {
        try {
            const page = await request('/observations?offset=' + encodeURIComponent(offset))
            const items = page.items.map(record => {
                const photos = Array.isArray(record.images) && record.images.length ? record.images : [record.image]
                const photoUrls = photos.filter(url => typeof url === 'string' && /^\/uploads\/[a-f0-9-]{36}$/.test(url))
                    .map(url => base.href.replace(/\/$/, '') + url)
                const row = record.kind === 'map_records' ? mapIdentity(record) : record
                return { ...row, photoUrls }
            })
            return { nextOffset: page.nextOffset, items }
        } catch (error) {
            if ([404, 405].includes(error.status)) throw new Error('当前云端服务尚未启用公开观察')
            throw error
        }
    })
    handle('is-cloud-enabled', async () => true)
    handle('is-social-enabled', async () => true)
    handle('get-cloud-status', async () => { try { await request('/health'); return true } catch { return false } })
    handle('get-current-user', async () => {
        await ready
        if (!session) return null
        try { return (await request('/auth/me')).user } catch { return null }
    })
    handle('get_current_user_profile', async () => {
        await ready
        if (!session) return null
        try { return await request('/profile') }
        catch (error) {
            if (![404, 405].includes(error.status)) throw error
            const { user } = await request('/auth/me')
            return { ...user, profile: { username: '猫友 ' + user.id.slice(0, 6) }, profile_editable: false }
        }
    })
    handle('update_profile', async (_event, input) => {
        try {
            await ready
            requireLogin()
            const { profileUpdate } = require('./user_profile')
            const update = profileUpdate(input, session.user.id)
            const result = await request('/profile', 'PUT', update)
            return { success: true, user: result }
        } catch (error) { return { success: false, error: [404, 405].includes(error.status) ? '服务器尚未启用个人档案编辑，请更新云端服务后再试。' : error.message } }
    })
    for (const action of ['login', 'register']) handle('auth-' + action, async (_event, input) => {
        try { session = await request('/auth/' + action, 'POST', input); saveSession(); return { success: true, user: session.user } }
        catch (error) { return { success: false, error: error.message } }
    })
    handle('auth-logout', async () => {
        try { if (session) await request('/auth/logout', 'POST', {}) }
        finally { session = null; saveSession() }
        return { success: true }
    })
    for (const [singular, kind] of [['record', 'records'], ['map_record', 'map_records'], ['cat', 'cats']]) {
        handle('get_' + kind, async () => list(kind))
        handle('add_' + singular, async (_event, input) => { requireLogin(); const row = await request('/' + kind, 'POST', await prepare(input)); return kind === 'map_records' ? mapIdentity(row) : row })
        handle('update_' + singular, async (_event, input) => {
            requireLogin()
            await request('/' + kind + '/' + encodeURIComponent(String(input.id).split('~').pop()), 'PUT', await prepare(input.cat || input.record))
            return true
        })
        handle('delete_' + singular, async (_event, input) => {
            requireLogin()
            await request('/' + kind + '/' + encodeURIComponent(String(typeof input === 'object' ? input.id : input).split('~').pop()), 'DELETE')
            return true
        })
    }
    function socialPath(id) {
        const [owner, record] = String(id).split('~')
        if (!owner || !record) throw new Error('请刷新地图后重试')
        return `/social/${encodeURIComponent(owner)}/${encodeURIComponent(record)}`
    }
    handle('get_record_interactions', async (_event, id) => request(socialPath(id) + '/interactions'))
    handle('toggle_like', async (_event, id) => {
        requireLogin()
        const route = socialPath(id)
        const state = await request(route + '/interactions')
        await request(route + '/like', state.is_liked ? 'DELETE' : 'PUT')
        return true
    })
    handle('add_comment', async (_event, { recordId, content }) => { requireLogin(); await request(socialPath(recordId) + '/comments', 'POST', { content }); return true })
    handle('delete_comment', async (_event, id) => { requireLogin(); await request('/comments/' + encodeURIComponent(id), 'DELETE'); return true })
    handle('export_data', async () => {
        requireLogin()
        const result = await dialog.showSaveDialog({ title: '导出云端备份', defaultPath: 'meow-cloud-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
        if (result.canceled || !result.filePath) return { ok: false, message: '已取消导出' }
        const payload = { app: 'meow-meow-map', version: 1 }
        for (const kind of ['cats', 'records', 'map_records']) payload[kind] = (await list(kind, true, true)).map(row => ({ ...row, id: row._api_id || row.id }))
        fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2))
        return { ok: true, message: '已导出云端记录；照片路径指向本机缓存，请同时保留照片' }
    })
    handle('import_data', async () => {
        requireLogin()
        const result = await dialog.showOpenDialog({ title: '导入到云端', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] })
        if (result.canceled || !result.filePaths.length) return { ok: false, message: '已取消导入' }
        const file = result.filePaths[0]
        if (fs.statSync(file).size > 5 * 1024 * 1024) throw new Error('备份超过 5 MiB，请分批导入')
        const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (payload.app !== 'meow-meow-map') throw new Error('无效的喵喵地图备份')
        let count = 0
        const catIds = new Map()
        // Preserve stable IDs within the authenticated account; import cats first.
        for (const kind of ['cats', 'records', 'map_records']) {
            const existing = new Set((await list(kind, false, true)).map(row => String(row.id)))
            for (const row of payload[kind] || []) {
                const id = String(row.id || crypto.randomUUID())
                if (kind === 'cats') catIds.set(id, id)
                if (existing.has(id)) continue
                const copy = { ...row, id }
                if (copy.cat_id) copy.cat_id = catIds.get(String(copy.cat_id)) || null
                await request('/' + kind, 'POST', await prepare(copy))
                existing.add(id); count++
            }
        }
        return { ok: true, message: `已导入 ${count} 条记录，重复 ID 已跳过` }
    })
}
module.exports = { installMeowApi }
