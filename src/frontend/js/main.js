const {app, BrowserWindow, ipcMain, Menu, dialog} = require('electron')
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')
const { SUPABASE_URL, SUPABASE_KEY } = require('../../backend/supabase_config')
const { profileUpdate, localProfile } = require('../../backend/user_profile')
const LOCAL_PROFILE_FILE = path.join(app.getPath('userData'), 'observer-profile.json')
const { normalizeCat } = require('../../backend/cat_profile')
const { initializeLocalStore } = require('../../backend/local_store')
const { randomUUID } = require('crypto')
const { findRecordIndex } = require('../../backend/utils')
const { compressImageForUpload, profileAvatarFromFile } = require('../../backend/image_utils')

// 初始化 Supabase 客户端
// 自定义存储适配器，用于在 Electron 主进程中持久化 Session
const storagePath = path.join(app.getPath('userData'), 'supabase-session.json')
const customStorage = {
    getItem: (key) => {
        try {
            if (!fs.existsSync(storagePath)) return null
            const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'))
            return data[key]
        } catch {
            return null
        }
    },
    setItem: (key, value) => {
        try {
            let data = {}
            if (fs.existsSync(storagePath)) {
                data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'))
            }
            data[key] = value
            fs.writeFileSync(storagePath, JSON.stringify(data), 'utf-8')
        } catch (e) {
            console.error('Error saving session:', e)
        }
    },
    removeItem: (key) => {
        try {
            if (!fs.existsSync(storagePath)) return
            const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'))
            delete data[key]
            fs.writeFileSync(storagePath, JSON.stringify(data), 'utf-8')
        } catch (e) {
            console.error('Error removing session:', e)
        }
    }
}

const isPlaceholder = (value) => !value || /^(your|ignore|replace|待配置)/i.test(String(value).trim())
const supabase = (process.env.MEOW_ENABLE_CLOUD === '1' && !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_KEY))
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            storage: customStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false
        }
    }) 
    : null;

// 保留本地模式的数据和首次迁移；默认云端模式由文件末尾的 API 适配器接管。
const localFiles = initializeLocalStore(
    app.getPath('userData'),
    app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../../data')
)
const RECORDS_FILE = localFiles.records

let mainWindow
function createWindow(){
    mainWindow = new BrowserWindow({
        // x: 200,
        // y: 200,
        width: 1200,
        height: 900,
        show: false,
        resizable: true,
        icon: path.join(__dirname, '../assets/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            nodeIntegrationInSubFrames: true,
            contextIsolation: false,
            // Existing map records can contain local image paths. The app already
            // runs with Node integration, so keep the same behavior for views
            // rendered inside the workspace frame.
            webSecurity: false
        }
    })
    const menutemp = []
    const menu = Menu.buildFromTemplate(menutemp)
    Menu.setApplicationMenu(menu)
    //mainWindow.webContents.openDevTools()
    mainWindow.loadFile(path.join(__dirname, '../html/app.html'))
    mainWindow.on('ready-to-show', ()=> mainWindow.show())
    mainWindow.on('close', ()=> mainWindow = null)
}
app.whenReady().then(()=>{
    createWindow()
})

// 子窗口统一走这个工厂，避免每处重复一份 BrowserWindow 样板配置
function createChildWindow({ parent = mainWindow, width, height, file, query, resizable = true, modal = false, webSecurity = false }) {
    const win = new BrowserWindow({
        width,
        height,
        parent,
        modal,
        resizable,
        show: false,
        icon: path.join(__dirname, '../assets/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity
        }
    })
    win.setMenu(null)
    win.loadFile(file, query ? { query } : undefined)
    win.on('ready-to-show', () => win.show())
    return win
}
ipcMain.handle('select-image', async (event, allowMultiple = false) => {
    const result = await dialog.showOpenDialog({
        title: '选择图片',
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
        properties: ['openFile', allowMultiple ? 'multiSelections' : null].filter(Boolean)
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return allowMultiple ? result.filePaths : result.filePaths[0]
})
ipcMain.handle('save_cat_avatar_crop', async (_event, data) => {
    if (typeof data !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 1024 * 1024) throw new Error('头像格式无效')
    const { nativeImage } = require('electron')
    const image = nativeImage.createFromDataURL(data)
    const size = image.getSize()
    if (image.isEmpty() || size.width !== 512 || size.height !== 512) throw new Error('头像尺寸无效')
    const directory = path.join(app.getPath('userData'), 'cat-avatars')
    fs.mkdirSync(directory, { recursive: true })
    const target = path.join(directory, randomUUID() + '.jpg')
    fs.writeFileSync(target, image.toJPEG(90))
    return target
})

ipcMain.handle('select_profile_avatar', async event => {
    const options = { title: '选择个人头像', filters: [{ name: '头像图片', extensions: ['jpg', 'jpeg', 'png'] }], properties: ['openFile'] }
    const owner = BrowserWindow.fromWebContents(event.sender)
    const result = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options))
    if (result.canceled || !result.filePaths.length) return null
    return profileAvatarFromFile(result.filePaths[0])
})
ipcMain.handle('ask_cat_assistant', async () => ({
    error: '寻猫小助手需要连接云端，本地模式下仍可使用地图和观察记录。'
}))
ipcMain.handle('get_public_observations', async () => {
    throw new Error('公开观察需要连接云端')
})

const API_KEY = "your api_key"
// 拍照识猫：用多模态大模型识别图片中的猫咪品种（不再依赖本地 PyTorch 模型）
const VL_MODEL = 'qwen-vl-plus'
const VL_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
ipcMain.handle('recognize_cat_image', async (event, imagePath) => {
    if (!API_KEY || API_KEY === 'your api_key') {
        return { ok: false, message: 'AI 识别服务尚未配置 API Key，请先在 main.js 中填写。' }
    }
    if (!imagePath || !fs.existsSync(imagePath)) {
        return { ok: false, message: '图片不存在，请重新选择。' }
    }
    try {
        const base64 = fs.readFileSync(imagePath).toString('base64')
        const response = await axios.post(
            VL_ENDPOINT,
            {
                model: VL_MODEL,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
                        { type: 'text', text: '请识别图片中的猫咪。如果是猫，请按以下格式简短回答：品种：xxx；毛色特征：xxx；可能的性格：xxx。如果图中没有猫，请只回答：未识别到猫咪。' }
                    ]
                }]
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        )
        const text = response.data?.choices?.[0]?.message?.content
        if (!text) throw new Error('模型未返回内容')
        return { ok: true, text }
    } catch (err) {
        console.error('AI识别失败：', err.message)
        return { ok: false, message: err.response?.data?.message || err.message || '识别请求失败' }
    }
})

let recordsWin
ipcMain.handle('open_records', async()=>{
    if (recordsWin) {
        recordsWin.focus()
        return
    }
    recordsWin = createChildWindow({
        width: 1000,
        height: 800,
        parent: null,
        file: path.join(__dirname, '../html/records.html')
    })
    recordsWin.on('close', () => recordsWin = null)
})

// ==========================================
// 图片本地化：添加/编辑本地记录时把图片拷贝进应用数据目录，
// 原图移动、改名或删除后记录不再裂图。已在 images 目录下的路径原样保留
// ==========================================
const IMAGES_DIR = path.join(app.getPath('userData'), 'images')

function localizeImageIfNeeded(imgPath) {
    try {
        if (!imgPath || typeof imgPath !== 'string' || !fs.existsSync(imgPath)) return imgPath
        if (path.resolve(imgPath).startsWith(path.resolve(IMAGES_DIR))) return imgPath
        if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true })
        const dest = path.join(IMAGES_DIR, `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${path.basename(imgPath)}`)
        fs.copyFileSync(imgPath, dest)
        return dest
    } catch (e) {
        console.error('图片本地化失败:', e)
        return imgPath
    }
}

function localizeRecordImages(record) {
    if (Array.isArray(record.images)) {
        record.images = record.images.map(localizeImageIfNeeded)
    }
    if (record.image) {
        record.image = localizeImageIfNeeded(record.image)
    }
    return record
}

// Helper for Supabase retries
async function supabaseWithRetry(operation, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await operation();
            // If result is null/undefined (e.g. from a void function), treat as success
            if (!result) return result;
            // If result has error property, treat as failure
            if (result.error) {
                lastError = result.error;
                console.warn(`Supabase operation failed (attempt ${i + 1}/${maxRetries}):`, lastError.message);
            } else {
                return result;
            }
        } catch (err) {
            lastError = err;
            console.warn(`Supabase operation threw (attempt ${i + 1}/${maxRetries}):`, err.message);
        }
        // Wait before retrying (exponential backoff: 1s, 2s, 4s)
        if (i < maxRetries - 1) await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
    return { data: null, error: lastError };
}

// Helper to get user with retry
async function getUserWithRetry() {
    if (!supabase) return { data: { user: null } };
    return await supabaseWithRetry(() => supabase.auth.getUser());
}

ipcMain.handle('get_records', async () => {
    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        if (!user) return []

        const { data, error } = await supabaseWithRetry(() => supabase
            .from('records')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
        )
        
        if (error) {
            console.error('Supabase get_records error:', error)
            return []
        }
        return data
    } else {
        // Fallback to local file
        if (!fs.existsSync(RECORDS_FILE)) return []
        const data = fs.readFileSync(RECORDS_FILE, 'utf-8')
        return JSON.parse(data)
    }
})

ipcMain.handle('add_record', async (event, record) => {
    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        if (!user) throw new Error('User not logged in')

        const { error } = await supabaseWithRetry(() => supabase
            .from('records')
            .insert([{ ...record, user_id: user.id }])
        )
        
        if (error) {
            console.error('Supabase add_record error:', error)
            throw error
        }
        return true
    } else {
        let records = []
        if (fs.existsSync(RECORDS_FILE)) {
            records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'))
        }
        records.push(localizeRecordImages({ ...record, id: randomUUID() }))
        fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8')
        return true
    }
})

let addRecordWin
ipcMain.handle('open_add_record_window', async (event) => {
    if (addRecordWin) { addRecordWin.focus(); return }
    const parentWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow
    addRecordWin = createChildWindow({
        width: 480,
        height: 760,
        parent: parentWindow,
        modal: true,
        file: path.join(__dirname, '../html/add_record.html')
    })
    addRecordWin.on('close', () => addRecordWin = null)
})

ipcMain.handle('delete_record', async (event, { index, id }) => {
    if (supabase) {
        if (!id) return false
        const { error } = await supabaseWithRetry(() => 
            supabase.from('records').delete().eq('id', id)
        )
        
        if (error) {
            console.error('Supabase delete_record error:', error)
            throw new Error(error.message || 'Delete failed')
        }
        return true
    } else {
        if (!fs.existsSync(RECORDS_FILE)) return false;
        const records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'));
        const recordIndex = findRecordIndex(records, { index, id });
        if (recordIndex < 0) return false;
        records.splice(recordIndex, 1)
        fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
        return true;
    }
})

const MAP_RECORDS_FILE = localFiles.map_records

let mapWin
ipcMain.handle('open_map_window', async (_event, target) => {
    const hasPosition = Number.isFinite(target?.lat) && Number.isFinite(target?.lng) &&
        Math.abs(target.lat) <= 90 && Math.abs(target.lng) <= 180
    if (mapWin) {
        mapWin.focus()
        if (hasPosition) {
            const contents = mapWin.webContents
            const locate = () => contents.send('locate-map-record', target)
            if (contents.isLoadingMainFrame()) contents.once('did-finish-load', locate)
            else locate()
        }
        return
    }
    // webSecurity: false 允许地图记录加载本地磁盘上的图片
    mapWin = createChildWindow({
        width: 1000,
        height: 800,
        parent: null,
        query: hasPosition ? { id: String(target.id ?? ''), lat: String(target.lat), lng: String(target.lng) } : undefined,
        file: path.join(__dirname, '../html/map.html')
    })
    mapWin.on('close', () => mapWin = null)
})

ipcMain.handle('get_map_records', async () => {
    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        // if (!user) return [] // Allow viewing without login? Or maybe just return all.
        // Let's allow viewing all records even if not logged in, but we need user to know "is_mine"

        const { data, error } = await supabaseWithRetry(() => supabase
            .from('map_records')
            .select('*, profiles(username, avatar_url)')
        )
        
        if (error) {
            console.error('Supabase get_map_records error:', error)
            return []
        }
        
        return data.map(r => ({
            ...r,
            is_mine: user ? r.user_id === user.id : false
        }))
    } else {
        if (!fs.existsSync(MAP_RECORDS_FILE)) return []
        const records = JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'))
        return records.map(record => ({ ...record, is_mine: true }))
    }
})

ipcMain.handle('add_map_record', async (event, record) => {
    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        if (!user) throw new Error('User not logged in')

        const imageUrls = [];
        
        // Handle multiple images
        if (record.images && Array.isArray(record.images)) {
            for (const imgPath of record.images) {
                if (fs.existsSync(imgPath)) {
                    try {
                        const { buffer: fileBuffer, mimeType } = compressImageForUpload(imgPath)
                        const fileName = `map_images/${Date.now()}_${Math.random().toString(36).substring(7)}_${path.basename(imgPath)}`;

                        const { error: uploadError } = await supabaseWithRetry(() => supabase.storage
                            .from('cats')
                            .upload(fileName, fileBuffer, {
                                contentType: mimeType
                            })
                        );

                        if (!uploadError) {
                            const { data: { publicUrl } } = supabase.storage
                                .from('cats')
                                .getPublicUrl(fileName);
                            imageUrls.push(publicUrl);
                        }
                    } catch (err) {
                        console.error('Image upload failed:', err);
                    }
                }
            }
        }
        // Fallback/Legacy single image
        else if (record.image && fs.existsSync(record.image)) {
            try {
                const { buffer: fileBuffer, mimeType } = compressImageForUpload(record.image)
                const fileName = `map_images/${Date.now()}_${path.basename(record.image)}`;
                const { error: uploadError } = await supabaseWithRetry(() => supabase.storage
                    .from('cats')
                    .upload(fileName, fileBuffer, { contentType: mimeType })
                );
                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage.from('cats').getPublicUrl(fileName);
                    imageUrls.push(publicUrl);
                }
            } catch (err) { console.error('Legacy image upload failed:', err); }
        }

        const newRecord = { 
            ...record, 
            images: imageUrls, 
            image: imageUrls[0] || null, // Keep legacy field populated
            user_id: user.id 
        };
        delete newRecord.id; 

        const { error } = await supabaseWithRetry(() => supabase
            .from('map_records')
            .insert([newRecord])
        )
        
        if (error) {
            console.error('Supabase add_map_record error:', error)
            throw error
        }
        return true
    } else {
        let records = []
        if (fs.existsSync(MAP_RECORDS_FILE)) {
            records = JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'))
        }
        records.push(localizeRecordImages(record))
        fs.writeFileSync(MAP_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8')
        return true
    }
})

// Social Features Handlers
ipcMain.handle('get_record_interactions', async (event, recordId) => {
    if (!supabase) return { likes: 0, comments: [], is_liked: false };
    
    const { data: { user } } = await getUserWithRetry();

    // Get Likes Count
    const { count: likesCount } = await supabaseWithRetry(() => supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('record_id', recordId)
    );

    // Check if current user liked
    let isLiked = false;
    if (user) {
        const { data } = await supabaseWithRetry(() => supabase
            .from('likes')
            .select('id')
            .eq('record_id', recordId)
            .eq('user_id', user.id)
            .maybeSingle()
        );
        isLiked = !!data;
    }

    // Get Comments
    const { data: comments } = await supabaseWithRetry(() => supabase
        .from('comments')
        .select('*, profiles(username, avatar_url)')
        .eq('record_id', recordId)
        .order('created_at', { ascending: true })
    );

    return { likes: likesCount || 0, comments: comments || [], is_liked: isLiked };
});

ipcMain.handle('toggle_like', async (event, recordId) => {
    if (!supabase) return false;
    const { data: { user } } = await getUserWithRetry();
    if (!user) throw new Error('请先登录');

    const { data } = await supabaseWithRetry(() => supabase
        .from('likes')
        .select('id')
        .eq('record_id', recordId)
        .eq('user_id', user.id)
        .maybeSingle()
    );

    if (data) {
        await supabaseWithRetry(() => supabase.from('likes').delete().eq('id', data.id));
        return false; // unliked
    } else {
        await supabaseWithRetry(() => supabase.from('likes').insert([{ record_id: recordId, user_id: user.id }]));
        return true; // liked
    }
});

ipcMain.handle('add_comment', async (event, { recordId, content }) => {
    if (!supabase) return false;
    const { data: { user } } = await getUserWithRetry();
    if (!user) throw new Error('请先登录');

    const { error } = await supabaseWithRetry(() => supabase
        .from('comments')
        .insert([{ record_id: recordId, user_id: user.id, content }])
    );
    
    if (error) throw error;
    return true;
});

ipcMain.handle('delete_comment', async (event, commentId) => {
    if (!supabase) return false;
    const { data: { user } } = await getUserWithRetry();
    if (!user) throw new Error('请先登录');

    const { error } = await supabaseWithRetry(() => supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id) // Double check ownership, though RLS handles it
    );
    
    if (error) throw error;
    return true;
});

ipcMain.handle('get_current_user_profile', async () => {
    if (!supabase) return { ...localProfile(LOCAL_PROFILE_FILE), avatar_editable: true };
    const { data: { user } } = await getUserWithRetry();
    if (!user) return null;
    
    const { data: profile } = await supabaseWithRetry(() => supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
    );
        
    return { ...user, profile, avatar_editable: true };
});

ipcMain.handle('update_profile', async (event, input) => {
    if (!supabase) {
        try { return { success: true, user: localProfile(LOCAL_PROFILE_FILE, input) } }
        catch (error) { return { success: false, error: error.message } }
    }
    const { avatarPath } = input;
    const { data: { user } } = await getUserWithRetry();
    if (!user) return false;

    let fields;
    try { fields = profileUpdate(input, user.id) }
    catch (error) { return { success: false, error: error.message } }
    let avatarUrl = null;
    if (avatarPath && fs.existsSync(avatarPath)) {
        try {
            const { buffer: fileBuffer, mimeType } = compressImageForUpload(avatarPath)
            const fileName = `avatars/${user.id}_${Date.now()}.jpg`;

            const { error: uploadError } = await supabaseWithRetry(() => supabase.storage
                .from('cats')
                .upload(fileName, fileBuffer, { contentType: mimeType, upsert: true })
            );

            if (uploadError) {
                console.error("Avatar upload error:", uploadError);
                return { success: false, error: '头像上传失败: ' + uploadError.message };
            }

            const { data: { publicUrl } } = supabase.storage.from('cats').getPublicUrl(fileName);
            avatarUrl = publicUrl;
            
        } catch (e) { 
            console.error("Avatar upload exception:", e); 
            return { success: false, error: '头像上传出错: ' + e.message };
        }
    }

    const updates = { updated_at: new Date(), ...fields };
    if (avatarUrl) updates.avatar_url = avatarUrl;

    const { error } = await supabaseWithRetry(() => supabase
        .from('profiles')
        .upsert({ id: user.id, ...updates })
    );
    
    if (error) return { success: false, error: error.message };
    return { success: true, user: { ...user, profile: updates } };
});

ipcMain.handle('update_record', async (event, { id, index, record }) => {
    if (supabase) {
        if (!id) return false
        
        const { data: { user } } = await getUserWithRetry()
        if (!user) {
            console.error('Supabase update_record: User not logged in')
            return false
        }

        console.log(`Attempting to update record. ID: ${id} (Type: ${typeof id}), User: ${user.id}, Data:`, record)

        // Debug: Check if record exists and belongs to user
        const { data: existingRecord, error: checkError } = await supabase
            .from('records')
            .select('*')
            .eq('id', id)
            .maybeSingle()
            
        if (checkError) {
             console.error('Debug check error:', checkError)
        } else if (!existingRecord) {
             console.error('Debug check: Record not found via ID lookup.')
        } else {
             console.log('Debug check: Record found:', existingRecord)
             if (existingRecord.user_id !== user.id) {
                 console.error(`Debug check: User ID mismatch! Record user: ${existingRecord.user_id}, Current user: ${user.id}`)
             }
        }

        // Use supabaseWithRetry and select() to verify update
        // We remove the explicit .eq('user_id', user.id) check here and rely on RLS policies
        // to allow the update. Sometimes explicit checks can fail if types don't match perfectly
        // or if the RLS policy logic conflicts.
        const { data, error } = await supabaseWithRetry(() => 
            supabase
                .from('records')
                .update(record)
                .eq('id', id) 
                .select()
        )
        
        if (error) {
            console.error('Supabase update_record error:', error)
            throw error
        }
        
        // Check if any row was actually updated
        if (!data || data.length === 0) {
            console.warn(`Supabase update_record: No rows updated. ID: ${id}. Possible causes: ID mismatch, RLS restriction, or record deleted.`)
            
            // FALLBACK STRATEGY: Delete + Insert
            // This handles the case where RLS allows DELETE/INSERT but not UPDATE
            console.log('Attempting Fallback: Delete + Insert...');
            
            // 1. Try to delete the old record
            const { error: delError } = await supabase
                .from('records')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id); // Ensure we only delete our own

            if (delError) {
                console.error('Fallback Delete failed:', delError);
                return false;
            }

            // 2. Insert the new record
            // Preserve created_at if possible to keep order, otherwise it will be new
            const newPayload = { ...record, user_id: user.id };
            if (existingRecord && existingRecord.created_at) {
                newPayload.created_at = existingRecord.created_at;
            }

            const { error: insertError } = await supabase
                .from('records')
                .insert([newPayload]);

            if (insertError) {
                console.error('Fallback Insert failed:', insertError);
                // Try to restore? (Complex, maybe just warn)
                return false;
            }

            console.log('Fallback Delete + Insert successful.');
            return true;
        }
        
        return true
    } else {
        if (!fs.existsSync(RECORDS_FILE)) return false;
        const records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'));
        const recordIndex = findRecordIndex(records, { index, id });
        if (recordIndex < 0) return false;
        records[recordIndex] = { ...records[recordIndex], ...record };
        fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
        return true;
    }
})

ipcMain.handle('delete_map_record', async (event, { id, index }) => {
    if (supabase) {
        if (!id) return false
        const { error } = await supabaseWithRetry(() => 
            supabase.from('map_records').delete().eq('id', id)
        )
        
        if (error) {
            console.error('Supabase delete_map_record error:', error)
            throw new Error(error.message || 'Delete failed')
        }
        return true
    } else {
        if (!fs.existsSync(MAP_RECORDS_FILE)) return false;
        const records = JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'));
        const recordIndex = findRecordIndex(records, { index, id });
        if (recordIndex < 0) return false;
        records.splice(recordIndex, 1)
        fs.writeFileSync(MAP_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
        return true;
    }
})

ipcMain.handle('update_map_record', async (event, { id, index, record }) => {
    if (supabase) {
        if (!id) return false

        const imageUrls = [];
        // Handle images (mix of existing URLs and new local paths)
        if (record.images && Array.isArray(record.images)) {
            for (const imgPath of record.images) {
                if (typeof imgPath === 'string' && (imgPath.startsWith('http') || imgPath.startsWith('//'))) {
                    imageUrls.push(imgPath);
                } else if (typeof imgPath === 'string' && fs.existsSync(imgPath)) {
                    try {
                        const { buffer: fileBuffer, mimeType } = compressImageForUpload(imgPath)
                        const fileName = `map_images/${Date.now()}_${Math.random().toString(36).substring(7)}_${path.basename(imgPath)}`;

                        const { error: uploadError } = await supabaseWithRetry(() => supabase.storage
                            .from('cats')
                            .upload(fileName, fileBuffer, { contentType: mimeType })
                        );

                        if (!uploadError) {
                            const { data: { publicUrl } } = supabase.storage.from('cats').getPublicUrl(fileName);
                            imageUrls.push(publicUrl);
                        }
                    } catch (err) {
                        console.error('Image upload failed:', err);
                    }
                }
            }
        }

        const updates = {
            ...record,
            images: imageUrls,
            image: imageUrls[0] || null
        };
        delete updates.id; // Ensure ID is not updated

        const { error } = await supabase
            .from('map_records')
            .update(updates)
            .eq('id', id)
        
        if (error) {
            console.error('Supabase update_map_record error:', error)
            throw error
        }
        return true
    } else {
        if (!fs.existsSync(MAP_RECORDS_FILE)) return false;
        const records = JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'));
        const recordIndex = findRecordIndex(records, { index, id });
        if (recordIndex < 0) return false;
        records[recordIndex] = { ...records[recordIndex], ...localizeRecordImages(record) };
        fs.writeFileSync(MAP_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
        return true;
    }
})

// Auth Handlers
let loginWin
ipcMain.handle('open_login_window', async () => {
    if (loginWin) {
        loginWin.focus()
        return
    }
    loginWin = createChildWindow({
        width: 500,
        height: 600,
        parent: null,
        resizable: false,
        file: path.join(__dirname, '../html/login.html')
    })
    loginWin.on('close', () => loginWin = null)
})

ipcMain.handle('auth-login', async (event, { email, password }) => {
    if (!supabase) return { success: false, error: 'Supabase not configured' }
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, user: data.user }
})

ipcMain.handle('auth-register', async (event, { email, password }) => {
    if (!supabase) return { success: false, error: 'Supabase not configured' }
    
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, user: data.user }
})

ipcMain.handle('auth-logout', async () => {
    if (!supabase) return { success: false }
    const { error } = await supabase.auth.signOut()
    if (error) return { success: false, error: error.message }
    return { success: true }
})

ipcMain.handle('get-current-user', async () => {
    if (!supabase) return null
    const { data: { session } } = await supabase.auth.getSession()
    return session ? session.user : null
})

ipcMain.handle('is-cloud-enabled', async () => Boolean(supabase))
ipcMain.handle('is-social-enabled', async () => Boolean(supabase))

// ==========================================
// 猫咪档案：把多次目击归到同一只猫下
// ==========================================
const CATS_FILE = localFiles.cats

function readLocalCats() {
    if (!fs.existsSync(CATS_FILE)) return []
    try {
        return JSON.parse(fs.readFileSync(CATS_FILE, 'utf-8'))
    } catch (e) {
        console.error('读取本地猫咪档案失败:', e)
        return []
    }
}

ipcMain.handle('get_cats', async () => {
    if (supabase) {
        const { data, error } = await supabaseWithRetry(() => supabase
            .from('cats')
            .select('*')
            .order('created_at', { ascending: false })
        )
        if (error) {
            console.error('Supabase get_cats error:', error)
            return []
        }
        return data
    }
    return readLocalCats()
})

ipcMain.handle('add_cat', async (event, cat) => {
    cat = normalizeCat(cat)
    if (cat.avatar && !cat.avatar.startsWith('builtin:')) cat.avatar = localizeRecordImages({ images: [cat.avatar] }).images[0]
    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        if (!user) throw new Error('User not logged in')
        const { data, error } = await supabaseWithRetry(() => supabase
            .from('cats')
            .insert([{ ...cat, user_id: user.id }])
            .select()
        )
        if (error) {
            console.error('Supabase add_cat error:', error)
            throw error
        }
        return data?.[0] || true
    } else {
        const cats = readLocalCats()
        const newCat = { ...cat, id: randomUUID(), created_at: new Date().toISOString() }
        cats.push(newCat)
        fs.writeFileSync(CATS_FILE, JSON.stringify(cats, null, 2), 'utf-8')
        return newCat
    }
})

ipcMain.handle('update_cat', async (event, { id, cat }) => {
    cat = normalizeCat(cat)
    if (cat.avatar && !cat.avatar.startsWith('builtin:')) cat.avatar = localizeRecordImages({ images: [cat.avatar] }).images[0]
    if (supabase) {
        const { error } = await supabaseWithRetry(() => supabase
            .from('cats')
            .update(cat)
            .eq('id', id)
        )
        if (error) throw error
        return true
    } else {
        const cats = readLocalCats()
        const recordIndex = findRecordIndex(cats, { id })
        if (recordIndex < 0) return false
        cats[recordIndex] = { ...cats[recordIndex], ...cat }
        fs.writeFileSync(CATS_FILE, JSON.stringify(cats, null, 2), 'utf-8')
        return true
    }
})

ipcMain.handle('delete_cat', async (event, id) => {
    if (supabase) {
        const { error } = await supabaseWithRetry(() => supabase
            .from('cats')
            .delete()
            .eq('id', id)
        )
        if (error) throw error
        return true
    } else {
        const cats = readLocalCats()
        const recordIndex = findRecordIndex(cats, { id })
        if (recordIndex < 0) return false
        cats.splice(recordIndex, 1)
        fs.writeFileSync(CATS_FILE, JSON.stringify(cats, null, 2), 'utf-8')
        // 同步解除观察记录/地图记录上对这只猫的关联
        for (const recordFile of [RECORDS_FILE, MAP_RECORDS_FILE]) {
            if (!fs.existsSync(recordFile)) continue
            try {
                const list = JSON.parse(fs.readFileSync(recordFile, 'utf-8'))
                const cleaned = list.map(r => String(r.cat_id) === String(id) ? { ...r, cat_id: null } : r)
                fs.writeFileSync(recordFile, JSON.stringify(cleaned, null, 2), 'utf-8')
            } catch (e) {
                console.error('解除档案关联失败:', e)
            }
        }
        return true
    }
})

// ==========================================
// 数据导出 / 导入：JSON 备份，跨模式可用
// ==========================================
ipcMain.handle('export_data', async () => {
    const now = new Date()
    const defaultName = `meowmeow-backup-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.json`
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: '导出数据备份',
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { ok: false, message: '已取消导出' }

    let records = []
    let mapRecords = []
    let cats = []

    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        if (!user) return { ok: false, message: '导出云端数据前请先登录' }
        const r = await supabaseWithRetry(() => supabase.from('records').select('*').eq('user_id', user.id))
        if (r.data) records = r.data
        const m = await supabaseWithRetry(() => supabase.from('map_records').select('*').eq('user_id', user.id))
        if (m.data) mapRecords = m.data
        const c = await supabaseWithRetry(() => supabase.from('cats').select('*').eq('user_id', user.id))
        if (c.data) cats = c.data
    } else {
        if (fs.existsSync(RECORDS_FILE)) records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'))
        if (fs.existsSync(MAP_RECORDS_FILE)) mapRecords = JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'))
        cats = readLocalCats()
    }

    const payload = {
        app: 'meow-meow-map',
        version: 1,
        exported_at: now.toISOString(),
        records,
        map_records: mapRecords,
        cats
    }
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { ok: true, message: `已导出 ${records.length} 条观察记录、${mapRecords.length} 条地图记录、${cats.length} 个档案` }
})

ipcMain.handle('import_data', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入数据备份',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return { ok: false, message: '已取消导入' }

    let payload
    try {
        payload = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'))
    } catch (e) {
        return { ok: false, message: '文件解析失败：' + e.message }
    }
    if (!payload || (!payload.records && !payload.map_records && !payload.cats)) {
        return { ok: false, message: '这不是有效的喵喵地图备份文件' }
    }

    const records = Array.isArray(payload.records) ? payload.records : []
    const mapRecords = Array.isArray(payload.map_records) ? payload.map_records : []
    const cats = Array.isArray(payload.cats) ? payload.cats : []

    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        if (!user) return { ok: false, message: '导入到云端前请先登录' }
        // 按已有 id 去重后增量插入，不覆盖云端现有数据
        const existing = async (table) => {
            const { data } = await supabaseWithRetry(() => supabase.from(table).select('id').eq('user_id', user.id))
            return new Set((data || []).map(r => String(r.id)))
        }
        const haveRecords = await existing('records')
        const haveMap = await existing('map_records')
        const haveCats = await existing('cats')
        const newRecords = records.filter(r => !r.id || !haveRecords.has(String(r.id))).map(r => ({ ...r, user_id: user.id }))
        const newMap = mapRecords.filter(r => !r.id || !haveMap.has(String(r.id))).map(r => { const c = { ...r, user_id: user.id }; delete c.id; return c })
        const newCats = cats.filter(c => !c.id || !haveCats.has(String(c.id))).map(c => ({ ...c, user_id: user.id }))
        if (newRecords.length) await supabaseWithRetry(() => supabase.from('records').insert(newRecords))
        if (newMap.length) await supabaseWithRetry(() => supabase.from('map_records').insert(newMap))
        if (newCats.length) await supabaseWithRetry(() => supabase.from('cats').insert(newCats))
        return { ok: true, message: `已导入 ${newRecords.length} 条观察记录、${newMap.length} 条地图记录、${newCats.length} 个档案` }
    }

    // 本地模式：按 id 去重合并
    const mergeByIdOrContent = (existingList, incomingList) => {
        const seen = new Set()
        for (const item of existingList) {
            seen.add(item.id !== undefined ? `id:${item.id}` : `c:${JSON.stringify(item)}`)
        }
        let added = 0
        for (const item of incomingList) {
            const key = item.id !== undefined ? `id:${item.id}` : `c:${JSON.stringify(item)}`
            if (seen.has(key)) continue
            seen.add(key)
            existingList.push(item)
            added++
        }
        return added
    }

    const localRecords = fs.existsSync(RECORDS_FILE) ? JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8')) : []
    const localMap = fs.existsSync(MAP_RECORDS_FILE) ? JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8')) : []
    const localCats = readLocalCats()

    const addedRecords = mergeByIdOrContent(localRecords, records)
    const addedMap = mergeByIdOrContent(localMap, mapRecords)
    const addedCats = mergeByIdOrContent(localCats, cats)

    fs.writeFileSync(RECORDS_FILE, JSON.stringify(localRecords, null, 2), 'utf-8')
    fs.writeFileSync(MAP_RECORDS_FILE, JSON.stringify(localMap, null, 2), 'utf-8')
    fs.writeFileSync(CATS_FILE, JSON.stringify(localCats, null, 2), 'utf-8')
    return { ok: true, message: `已合并导入 ${addedRecords} 条观察记录、${addedMap} 条地图记录、${addedCats} 个档案（重复数据已跳过）` }
})

// Personal observations must not include other people's public map records.
ipcMain.handle('get_own_map_records', async () => {
    if (!supabase) return fs.existsSync(MAP_RECORDS_FILE) ? JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf8')) : []
    const { data: { user } } = await getUserWithRetry()
    if (!user) return []
    const { data, error } = await supabaseWithRetry(() => supabase.from('map_records').select('*').eq('user_id', user.id))
    if (error) throw error
    return data || []
})

ipcMain.handle('seed_campus_demo', async () => {
    if (supabase) throw new Error('此示例入口仅支持默认云端或本地模式')
    const demo = require('../../backend/campus_demo').campusDemoData()
    const cats = readLocalCats()
    const records = fs.existsSync(MAP_RECORDS_FILE) ? JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf8')) : []
    const catIds = new Set(cats.map(row => row.id)), recordIds = new Set(records.map(row => row.id))
    cats.push(...demo.cats.filter(row => !catIds.has(row.id)))
    const missing = demo.records.filter(row => !recordIds.has(row.id))
    records.push(...missing)
    fs.writeFileSync(CATS_FILE, JSON.stringify(cats, null, 2))
    fs.writeFileSync(MAP_RECORDS_FILE, JSON.stringify(records, null, 2))
    return { added: missing.length, total: demo.records.length, campuses: demo.campuses.length }
})

// The standalone API is the default; MEOW_LOCAL_MODE=1 explicitly enables local JSON.
require('../../backend/meow_api_client').installMeowApi({
    ipcMain, app, dialog, safeStorage: require('electron').safeStorage, compressImageForUpload
})

// 当所有窗口都关闭时
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
