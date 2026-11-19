// A single small HTTP process. Secrets are read from a root-owned external file.
const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { promisify } = require('node:util')
const { findSightings, askDashScope, campusInventory } = require('./cat-assistant')
const builtinAvatars = new Set(require('../data/cat-avatar-presets.json').map(preset => preset.id))
const { profileUpdate } = require('../src/backend/user_profile')
const { parseCatReference, projectObservation, projectCat, catOwnerSql } = require('./cat-identity')
const mysql = require('mysql2/promise')
const scrypt = promisify(crypto.scrypt)
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const kinds = new Set(['cats', 'records', 'map_records'])
const failure = (status, message) => Object.assign(new Error(message), { status })
let active = 0
let authBusy = false
const authAttempts = new Map()

async function start() {
    const config = JSON.parse(await fs.readFile(process.env.MEOW_CONFIG || '/etc/meow-map/config.json', 'utf8'))
    const pool = mysql.createPool({ ...config.database, connectionLimit: 2, waitForConnections: true,
        queueLimit: 8, connectTimeout: 5000, charset: 'utf8mb4' })
    const query = async (sql, params = []) => (await pool.execute(sql, params))[0]
    const uploadDir = config.uploadDir || '/var/lib/meow-map/uploads'
    await fs.mkdir(uploadDir, { recursive: true })
    await query('SELECT 1')
    const assistantAttempts = new Map()
    let assistantBusy = false

    function reply(res, status, data) {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff' })
        res.end(JSON.stringify(data))
    }
    async function body(req, max = 65536) {
        if (Number(req.headers['content-length']) > max) throw failure(413, '请求内容过大')
        let length = 0
        const chunks = []
        for await (const chunk of req) {
            length += chunk.length
            if (length > max) throw failure(413, '请求内容过大')
            chunks.push(chunk)
        }
        return Buffer.concat(chunks)
    }
    async function json(req, max = 16384) {
        try { return JSON.parse((await body(req, max)).toString()) }
        catch (error) { if (error.status) throw error; throw failure(400, '无效 JSON') }
    }
    async function userOf(req) {
        const token = (req.headers.authorization || '').replace(/^Bearer /, '')
        if (!/^[a-f0-9]{64}$/.test(token)) throw failure(401, '请先登录')
        const rows = await query('SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>NOW()', [hash(token)])
        if (!rows[0]) throw failure(401, '登录已过期，请重新登录')
        return rows[0]
    }
    async function route(req, res) {
        const url = new URL(req.url, 'http://localhost')
        const parts = url.pathname.split('/').filter(Boolean)
        if (req.method === 'GET' && url.pathname === '/health') {
            await query('SELECT 1')
            return reply(res, 200, { ok: true, service: 'meow-map-api' })
        }
        if (req.method === 'POST' && ['login', 'register'].includes(parts[1]) && parts[0] === 'auth') {
            const ip = req.headers['x-real-ip'] || req.socket.remoteAddress
            const now = Date.now()
            for (const [key, value] of authAttempts) if (now - value.time > 60000) authAttempts.delete(key)
            const attempt = authAttempts.get(ip) || { time: now, count: 0 }
            if (attempt.count >= 10 || authAttempts.size >= 1000) throw failure(429, '操作过于频繁，请一分钟后重试')
            attempt.count++; authAttempts.set(ip, attempt)
            // Serialize memory-hard password work: no unbounded scrypt queue.
            if (authBusy) throw failure(429, '登录服务忙，请稍后再试')
            authBusy = true
            try {
                const input = await json(req)
                const email = String(input.email || '').trim().toLowerCase()
                const password = input.password
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 128) {
                    throw failure(400, '请填写有效邮箱和 8–128 位密码')
                }
                let user
                if (parts[1] === 'register') {
                    const salt = crypto.randomBytes(16).toString('hex')
                    const derived = await scrypt(password, salt, 64)
                    user = { id: crypto.randomUUID(), email }
                    try { await query('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)', [user.id, email, salt + ':' + derived.toString('hex')]) }
                    catch (error) { if (error.code === 'ER_DUP_ENTRY') throw failure(409, '邮箱已注册'); throw error }
                } else {
                    const rows = await query('SELECT id,email,password_hash FROM users WHERE email=?', [email])
                    const stored = rows[0]?.password_hash || '00000000000000000000000000000000:' + '0'.repeat(128)
                    const [salt, key] = stored.split(':')
                    const derived = await scrypt(password, salt, 64)
                    if (!crypto.timingSafeEqual(derived, Buffer.from(key, 'hex')) || !rows[0]) throw failure(401, '邮箱或密码错误')
                    user = { id: rows[0].id, email: rows[0].email }
                }
                await query('DELETE FROM sessions WHERE expires_at<NOW() OR user_id=?', [user.id])
                const token = crypto.randomBytes(32).toString('hex')
                await query('INSERT INTO sessions VALUES (?,?,DATE_ADD(NOW(),INTERVAL 7 DAY))', [hash(token), user.id])
                return reply(res, 200, { success: true, user, token })
            } finally { authBusy = false }
        }
        const publicList = url.pathname === '/observations'
        const publicMap = url.pathname === '/map_records' && url.searchParams.get('mine') !== '1'
        // Publish observation fields without exposing account email or cat profile notes.
        if (req.method === 'GET' && (publicList || publicMap)) {
            const offset = Number(url.searchParams.get('offset') || 0)
            if (!Number.isSafeInteger(offset) || offset < 0 || (publicMap && offset > 10000)) throw failure(400, '无效分页')
            const kinds = publicList ? "'records','map_records'" : "'map_records'"
            const rows = await query(`
                SELECT e.user_id,e.kind,e.id,e.payload,p.username,
                    JSON_UNQUOTE(JSON_EXTRACT(c.payload,'$.name')) AS cat_name,
                    JSON_UNQUOTE(JSON_EXTRACT(c.payload,'$.avatar')) AS cat_avatar
                FROM entries e LEFT JOIN entries c ON c.user_id=${catOwnerSql('e')} AND c.kind='cats'
                    AND c.id=JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.cat_id'))
                LEFT JOIN user_profiles p ON p.user_id=e.user_id
                WHERE e.kind IN (${kinds})
                ORDER BY e.created_at DESC,e.user_id,e.kind,e.id LIMIT 101 OFFSET ${offset}
            `)
            const items = rows.slice(0, 100).map(row => {
                const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
                const publicRecord = { id: row.id, user_id: row.user_id, cat_name: row.cat_name,
                    profiles: { username: row.username || '猫友 ' + row.user_id.slice(0, 6) } }
                if (builtinAvatars.has(row.cat_avatar) || /^\/uploads\/[a-f0-9-]{36}$/.test(row.cat_avatar || '')) publicRecord.cat_avatar = row.cat_avatar
                for (const key of ['title','desc','lat','lng','created_at','time','cat_id','cat_owner_id','images','image','area','university','campus','zone','is_demo','demo_batch','species','count']) {
                    if (payload[key] !== undefined) publicRecord[key] = payload[key]
                }
                if (publicList) {
                    publicRecord.kind = row.kind
                    for (const key of ['location', 'gender', 'notes']) {
                        if (payload[key] !== undefined) publicRecord[key] = payload[key]
                    }
                }
                return projectObservation(publicRecord, row.user_id)
            })
            return reply(res, 200, { items, nextOffset: rows.length > 100 ? offset + 100 : null })
        }
        // A photo is public while referenced by an observation from its owner.
        if (req.method === 'GET' && parts[0] === 'uploads' && /^[a-f0-9-]{36}$/.test(parts[1] || '')) {
            const imagePath = '/uploads/' + parts[1]
            const rows = await query("SELECT u.mime FROM uploads u WHERE u.id=? AND EXISTS (SELECT 1 FROM entries e WHERE e.user_id=u.user_id AND e.kind IN ('records','map_records') AND (JSON_CONTAINS(e.payload,JSON_QUOTE(?),'$.images') OR JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.image'))=?)) OR (u.id=? AND EXISTS (SELECT 1 FROM entries c JOIN entries e ON COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.cat_owner_id')),'null'),e.user_id)=c.user_id AND e.kind IN ('records','map_records') AND JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.cat_id'))=c.id WHERE c.user_id=u.user_id AND c.kind='cats' AND JSON_UNQUOTE(JSON_EXTRACT(c.payload,'$.avatar'))=?))", [parts[1], imagePath, imagePath, parts[1], imagePath])
            if (rows[0]) {
                const buffer = await fs.readFile(path.join(uploadDir, parts[1]))
                res.writeHead(200, { 'Content-Type': rows[0].mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
                return res.end(buffer)
            }
        }
        const social = parts[0] === 'social' && parts.length === 4
        if (social && req.method === 'GET' && parts[3] === 'interactions') {
            await requireMap(parts[1], parts[2])
            const viewer = req.headers.authorization ? await userOf(req) : null
            const likes = await query("SELECT COUNT(*) AS total,COALESCE(MAX(user_id=?),0) AS mine FROM likes WHERE owner_id=? AND record_id=? AND kind='map_records'", [viewer?.id || '', parts[1], parts[2]])
            const comments = await query("SELECT c.id,c.user_id,c.content,c.created_at,p.username FROM comments c LEFT JOIN user_profiles p ON p.user_id=c.user_id WHERE c.owner_id=? AND c.record_id=? AND c.kind='map_records' ORDER BY c.created_at DESC,c.id DESC LIMIT 100", [parts[1], parts[2]])
            return reply(res, 200, { likes: likes[0].total, is_liked: Boolean(likes[0].mine), comments: comments.reverse().map(row => ({ ...row, profiles: { username: row.username || '猫友 ' + row.user_id.slice(0, 6) } })) })
        }
        const user = await userOf(req)
        if (req.method === 'POST' && url.pathname === '/cat-assistant') {
            const apiKey = process.env.DASHSCOPE_API_KEY?.trim()
            const input = await json(req)
            const question = typeof input?.question === 'string' ? input.question.trim() : ''
            if (!question || question.length > 300) throw failure(400, '请输入 1–300 个字符的问题')
            if (assistantBusy) throw failure(429, '寻猫小助手正在回答，请稍后重试')
            const now = Date.now()
            for (const [id, attempt] of assistantAttempts) {
                if (now - attempt.start >= 60000) assistantAttempts.delete(id)
            }
            const attempt = assistantAttempts.get(user.id) || { start: now, count: 0 }
            if (attempt.count >= 5) throw failure(429, '提问过于频繁，请一分钟后重试')
            attempt.count++
            assistantAttempts.set(user.id, attempt)
            assistantBusy = true
            try {
                const inventory = await campusInventory(query, question)
                if (inventory) return reply(res, 200, inventory)
                if (!apiKey) throw failure(503, '寻猫小助手尚未配置，请联系管理员')
                const sightings = await findSightings(query, question)
                const result = await askDashScope({ apiKey, question, sightings }).catch(error => {
                    const timedOut = ['AbortError', 'TimeoutError'].includes(error.name) ||
                        ['AbortError', 'TimeoutError'].includes(error.cause?.name)
                    throw failure(timedOut ? 504 : 502, timedOut
                        ? '寻猫小助手回答超时，请重试' : '寻猫小助手暂时无法连接百炼，请稍后重试')
                })
                return reply(res, 200, result)
            } finally { assistantBusy = false }
        }
        if (url.pathname === '/profile' && ['GET', 'PUT'].includes(req.method)) {
            if (req.method === 'PUT') {
                let update
                try { update = profileUpdate(await json(req, 65536), user.id) }
                catch (error) { if (error.status) throw error; throw failure(400, error.message) }
                if (update.avatar_url === undefined) {
                    await query('INSERT INTO user_profiles (user_id,username) VALUES (?,?) ON DUPLICATE KEY UPDATE username=VALUES(username)', [user.id, update.username])
                } else {
                    await query('INSERT INTO user_profiles (user_id,username,avatar_url) VALUES (?,?,?) ON DUPLICATE KEY UPDATE username=VALUES(username),avatar_url=VALUES(avatar_url)', [user.id, update.username, update.avatar_url])
                }
            }
            const profiles = await query('SELECT username,avatar_url FROM user_profiles WHERE user_id=?', [user.id])
            return reply(res, 200, { ...user, avatar_editable: true,
                profile: { username: profiles[0]?.username || '猫友 ' + user.id.slice(0, 6), avatar_url: profiles[0]?.avatar_url || null } })
        }
        if (social && ['PUT', 'DELETE'].includes(req.method) && parts[3] === 'like') {
            await requireMap(parts[1], parts[2])
            if (req.method === 'PUT') await query('INSERT IGNORE INTO likes (owner_id,record_id,user_id) VALUES (?,?,?)', [parts[1], parts[2], user.id])
            else await query("DELETE FROM likes WHERE owner_id=? AND record_id=? AND user_id=? AND kind='map_records'", [parts[1], parts[2], user.id])
            return reply(res, 200, { ok: true })
        }
        if (social && req.method === 'POST' && parts[3] === 'comments') {
            await requireMap(parts[1], parts[2])
            const input = await json(req)
            const content = typeof input.content === 'string' ? input.content.trim() : ''
            if (!content || content.length > 1000) throw failure(400, '评论需为 1–1000 字')
            const recent = await query('SELECT COUNT(*) AS total FROM comments WHERE user_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 MINUTE)', [user.id])
            if (recent[0].total >= 5) throw failure(429, '每分钟最多发表 5 条评论')
            const count = await query("SELECT COUNT(*) AS total FROM comments WHERE owner_id=? AND record_id=? AND kind='map_records'", [parts[1], parts[2]])
            if (count[0].total >= 100) throw failure(409, '每条观察最多 100 条评论')
            const id = crypto.randomUUID()
            await query('INSERT INTO comments (id,owner_id,record_id,user_id,content) VALUES (?,?,?,?,?)', [id, parts[1], parts[2], user.id, content])
            return reply(res, 201, { id })
        }
        if (parts[0] === 'comments' && parts.length === 2 && req.method === 'DELETE') {
            const result = await query('DELETE FROM comments WHERE id=? AND user_id=?', [parts[1], user.id])
            if (!result.affectedRows) throw failure(404, '评论不存在或无权删除')
            return reply(res, 200, { ok: true })
        }
        if (url.pathname === '/auth/me' && req.method === 'GET') return reply(res, 200, { user })
        if (url.pathname === '/auth/logout' && req.method === 'POST') {
            await query('DELETE FROM sessions WHERE token_hash=?', [hash(req.headers.authorization.slice(7))])
            return reply(res, 200, { success: true })
        }
        if (parts[0] === 'uploads') {
            if (req.method === 'POST' && parts.length === 1) {
                const totals = await query('SELECT COALESCE(SUM(size),0) AS bytes FROM uploads')
                if (Number(totals[0].bytes) >= 1024 * 1024 * 1024) throw failure(507, '图片存储已达 1 GiB 上限')
                const buffer = await body(req, 2 * 1024 * 1024)
                let mime
                if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) mime = 'image/jpeg'
                if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = 'image/png'
                if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp'
                if (!mime) throw failure(400, '仅支持 JPEG、PNG、WebP 图片')
                const id = crypto.randomUUID()
                await fs.writeFile(path.join(uploadDir, id), buffer, { flag: 'wx' })
                try { await query('INSERT INTO uploads (id,user_id,mime,size) VALUES (?,?,?,?)', [id, user.id, mime, buffer.length]) }
                catch (error) { await fs.unlink(path.join(uploadDir, id)); throw error }
                return reply(res, 201, { id, url: '/uploads/' + id })
            }
            if (req.method === 'GET' && /^[a-f0-9-]{36}$/.test(parts[1] || '')) {
                const rows = await query('SELECT mime FROM uploads WHERE id=? AND user_id=?', [parts[1], user.id])
                if (!rows[0]) throw failure(404, '图片不存在')
                const buffer = await fs.readFile(path.join(uploadDir, parts[1]))
                res.writeHead(200, { 'Content-Type': rows[0].mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' })
                return res.end(buffer)
            }
        }
        if (url.pathname === '/cats/search' && req.method === 'GET') {
            const term = String(url.searchParams.get('q') || '').trim()
            const offset = Number(url.searchParams.get('offset') || 0)
            if (!term || term.length > 170 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) throw failure(400, '请输入猫咪名字或 ID')
            const rows = await query(`SELECT c.user_id,c.id,c.payload FROM entries c WHERE c.kind='cats'
                AND (LOCATE(?,JSON_UNQUOTE(JSON_EXTRACT(c.payload,'$.name')))>0 OR LOCATE(?,c.id)>0 OR CONCAT(c.user_id,'~',c.id)=?)
                ORDER BY (CONCAT(c.user_id,'~',c.id)=?) DESC,c.created_at DESC,c.user_id,c.id LIMIT 51 OFFSET ${offset}`, [term, term, term, term])
            return reply(res, 200, { items: rows.slice(0,50).map(row => projectCat(row, user.id, true)), nextOffset: rows.length > 50 ? offset + 50 : null })
        }
        const kind = parts[0]
        if (!kinds.has(kind) || parts.length > 2) throw failure(404, '接口不存在')
        let id = parts[1] ? decodeURIComponent(parts[1]) : null
        if (id && kind === 'cats') {
            const ref = parseCatReference(id, user.id)
            if (!ref) throw failure(400, '无效猫咪 ID')
            if (ref.owner !== user.id) throw failure(403, '只有创建者可以修改猫咪基础资料')
            id = ref.id
        }
        if (id && (id.length > 80 || !/^[\w-]+$/.test(id))) throw failure(400, '无效 ID')
        if (req.method === 'GET' && !id) {
            if (kind === 'cats') {
                const rows = await query(`SELECT c.user_id,c.id,c.payload FROM entries c WHERE c.kind='cats'
                    AND (c.user_id=? OR EXISTS (SELECT 1 FROM entries e WHERE e.user_id=? AND e.kind IN ('records','map_records')
                        AND ${catOwnerSql('e')}=c.user_id AND JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.cat_id'))=c.id))
                    ORDER BY c.created_at DESC,c.user_id,c.id LIMIT 1001`, [user.id, user.id])
                if (rows.length > 1000) throw failure(413, '猫咪数量超过当前版本读取上限')
                return reply(res, 200, rows.map(row => projectCat(row, user.id)))
            }
            const rows = await query('SELECT payload FROM entries WHERE user_id=? AND kind=? ORDER BY created_at DESC LIMIT 1001', [user.id, kind])
            if (rows.length > 1000) throw failure(413, '记录数量超过当前版本读取上限')
            return reply(res, 200, rows.map(row => projectObservation(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload, user.id)))
        }
        if ((req.method === 'POST' && !id) || (req.method === 'PUT' && id)) {
            const input = await json(req)
            if (!input || Array.isArray(input) || typeof input !== 'object') throw failure(400, '记录必须为对象')
            delete input.user_id; delete input.is_mine; delete input.profiles
            const entryId = id || String(input.id || crypto.randomUUID())
            if (!/^[\w-]{1,80}$/.test(entryId)) throw failure(400, '无效 ID')
            if (kind === 'cats' && (!String(input.name || '').trim() || String(input.name).length > 80)) throw failure(400, '昵称必填且不能超过 80 字')
            if (kind === 'map_records' && (!Number.isFinite(Number(input.lat)) || !Number.isFinite(Number(input.lng)) || Math.abs(Number(input.lat)) > 90 || Math.abs(Number(input.lng)) > 180)) throw failure(400, '地图坐标无效')
            delete input.cat_owner_id
            if (input.cat_id) {
                const ref = parseCatReference(input.cat_id, user.id)
                if (!ref) throw failure(400, '无效猫咪 ID')
                const cats = await query("SELECT id FROM entries WHERE user_id=? AND kind='cats' AND id=?", [ref.owner, ref.id])
                if (!cats.length) throw failure(400, '关联猫咪不存在，请重新搜索')
                input.cat_id = ref.id
                input.cat_owner_id = ref.owner
            } else if (input.cat_id === null || input.cat_id === '') input.cat_owner_id = null
            const current = await query('SELECT payload FROM entries WHERE user_id=? AND kind=? AND id=?', [user.id, kind, entryId])
            if (id && !current.length) throw failure(404, '记录不存在')
            if (!id && current.length) throw failure(409, '记录 ID 已存在')
            if (!id) {
                const counts = await query('SELECT COUNT(*) AS total FROM entries WHERE user_id=? AND kind=?', [user.id, kind])
                if (counts[0].total >= 1000) throw failure(409, '当前版本每类最多 1000 条记录')
            }
            if (input.images !== undefined && (!Array.isArray(input.images) || input.images.length > 6)) throw failure(400, '最多 6 张图片')
            const pictures = [...(input.images || (input.image ? [input.image] : []))]
            if (kind === 'cats' && input.avatar && !builtinAvatars.has(input.avatar)) pictures.push(input.avatar)
            for (const picture of pictures) {
                if (typeof picture !== 'string' || !/^\/uploads\/[a-f0-9-]{36}$/.test(picture)) throw failure(400, '无效图片引用')
                const owned = await query('SELECT id FROM uploads WHERE id=? AND user_id=?', [picture.split('/').pop(), user.id])
                if (!owned.length) throw failure(400, '不能发布他人的图片')
            }
            if (input.images) input.image = input.images[0] || ''
            const oldValue = current[0]?.payload || {}
            const old = typeof oldValue === 'string' ? JSON.parse(oldValue) : oldValue
            const payload = { ...(typeof old === 'string' ? JSON.parse(old) : old), ...input, id: entryId, user_id: user.id }
            payload.created_at = old.created_at || new Date().toISOString()
            if (id) await query('UPDATE entries SET payload=? WHERE user_id=? AND kind=? AND id=?', [JSON.stringify(payload), user.id, kind, id])
            else await query('INSERT INTO entries (user_id,kind,id,payload) VALUES (?,?,?,?)', [user.id, kind, entryId, JSON.stringify(payload)])
            return reply(res, id ? 200 : 201, kind === 'cats' ? projectCat({ user_id: user.id, id: entryId, payload }, user.id) : projectObservation(payload, user.id))
        }
        if (req.method === 'DELETE' && id) {
            if (kind === 'cats') {
                const shared = await query(`SELECT e.id FROM entries e WHERE e.user_id<>? AND e.kind IN ('records','map_records')
                    AND ${catOwnerSql('e')}=? AND JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.cat_id'))=? LIMIT 1`, [user.id, user.id, id])
                if (shared.length) throw failure(409, '这只猫已有其他用户的观察记录，不能删除共享档案')
            }
            if (kind === 'cats') await query("UPDATE entries SET payload=JSON_REMOVE(payload,'$.cat_id') WHERE user_id=? AND kind IN ('records','map_records') AND COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.cat_owner_id')),'null'),user_id)=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.cat_id'))=?", [user.id, user.id, id])
            const result = await query('DELETE FROM entries WHERE user_id=? AND kind=? AND id=?', [user.id, kind, id])
            if (!result.affectedRows) throw failure(404, '记录不存在')
            return reply(res, 200, { ok: true })
        }
        throw failure(405, '不支持此操作')
    }
    async function requireMap(owner, id) {
        const rows = await query("SELECT id FROM entries WHERE user_id=? AND id=? AND kind='map_records'", [owner, id])
        if (!rows.length) throw failure(404, '观察不存在')
    }
    const server = http.createServer(async (req, res) => {
        if (active >= 4) { reply(res, 503, { error: '服务忙，请稍后重试' }); return }
        active++
        try { await route(req, res) }
        catch (error) {
            // Do not log database errors, request bodies, credentials or tokens.
            if (!error.status) console.error('Request failed:', error.code || 'internal')
            if (!res.headersSent) reply(res, error.status || 500, { error: error.status ? error.message : '服务暂不可用' })
        } finally { active-- }
    })
    server.requestTimeout = 15000
    server.headersTimeout = 10000
    server.keepAliveTimeout = 3000
    server.maxConnections = 16
    server.listen(config.port || 8091, '127.0.0.1', () => console.log('meow-map-api ready on loopback'))
    process.on('SIGTERM', () => { server.close(async () => { await pool.end(); process.exit(0) }); setTimeout(() => process.exit(0), 5000).unref() })
}
start().catch(() => { console.error('Service startup failed; check external configuration and database'); process.exit(1) })
