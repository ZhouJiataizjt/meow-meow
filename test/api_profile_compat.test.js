const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { URL } = require('node:url')
/* global AbortSignal */
test('旧云端资料接口可读取只读身份，明确提示未部署，并只请求本人的地图记录', async () => {
    const handlers = new Map()
    const calls = []
    const user = { id:'test-user',email:'test@example.invalid' }
    const upload = '/uploads/12345678-1234-1234-1234-123456789abc'
    let profileStatus = 405
    const context = { module:{exports:{}}, require:createRequire(path.join(__dirname,'../src/backend/meow_api_client.js')), console, Buffer, URL:require('node:url').URL, AbortSignal,
        process:{env:{}}, fetch: async(url,options) => {
            const route = new URL(url).pathname
            calls.push(new URL(url).pathname + new URL(url).search)
            let status=200, data
            if(route.endsWith('/auth/login')) data={user,token:'test-session'}
            else if(route.endsWith('/profile')) { status=profileStatus; data={error:'不支持此操作'} }
            else if(route.endsWith('/auth/me')) data={user}
            else if(route.endsWith('/observations')) {
                assert.equal(options.headers.Authorization, undefined)
                assert.equal(new URL(url).searchParams.get('offset'), '100')
                data = { nextOffset: null, items: [
                    { id: 'shared', user_id: 'other', kind: 'records', image: upload },
                    { id: 'shared', user_id: 'other', kind: 'map_records', images: ['https://unexpected.invalid/photo'] }
                ] }
            }
            else if(route.endsWith('/map_records')) data=[{id:'map-one',lat:23,lng:113}]
            else throw Error('Unexpected path '+route)
            return {ok:status===200,status,json:async()=>data}
        } }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/backend/meow_api_client.js'),'utf8'),context)
    context.module.exports.installMeowApi({ipcMain:{removeHandler(){},handle:(name,fn)=>handlers.set(name,fn)},
        app:{getPath:()=>path.join(__dirname,'nonexistent-fixture'),whenReady:()=>Promise.resolve()},dialog:{},
        safeStorage:{isEncryptionAvailable:()=>false},compressImageForUpload(){}})
    const publicPage = await handlers.get('get_public_observations')(null, 100)
    assert.equal(publicPage.nextOffset, null)
    assert.equal(publicPage.items[0].kind, 'records')
    assert.equal(new URL(publicPage.items[0].photoUrls[0]).pathname, '/meow-api' + upload)
    assert.equal(publicPage.items[1].id, 'other~shared')
    assert.equal(publicPage.items[1].photoUrls.length, 0)
    await handlers.get('auth-login')(null,{email:'test@example.invalid',password:'test-password'})
    const current=await handlers.get('get_current_user_profile')()
    assert.equal(current.id,user.id)
    assert.equal(current.profile_editable,false)
    const saved=await handlers.get('update_profile')(null,{username:'猫友'})
    assert.equal(saved.success,false)
    assert.match(saved.error,/尚未启用/)
    const own=await handlers.get('get_own_map_records')()
    assert.equal(own[0].id,'test-user~map-one')
    assert.equal(own[0].is_mine,true)
    assert.ok(calls.includes('/meow-api/map_records?mine=1'))
    assert.ok(!calls.includes('/meow-api/map_records'))
    profileStatus=503
    await assert.rejects(handlers.get('get_current_user_profile')())
})
