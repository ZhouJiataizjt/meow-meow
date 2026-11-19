const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { URL } = require('node:url')
/* global AbortSignal */

test('云端客户端保留共享档案权限与完整 ID，搜索和修改使用正确路由', async () => {
    const handlers = new Map(), calls = []
    const file = path.join(__dirname,'../src/backend/meow_api_client.js')
    const context = {module:{exports:{}},require:createRequire(file),Buffer,URL,AbortSignal,console,process:{env:{}},
        fetch:async(url,options)=>{
            const route=new URL(url).pathname
            calls.push({route,method:options.method,search:new URL(url).search})
            let data
            if(route.endsWith('/auth/login')) data={token:'token',user:{id:'alice'}}
            else if(route.endsWith('/cats/search')) data={items:[{id:'bob~cat',name:'年糕',is_mine:false}],nextOffset:null}
            else if(route.endsWith('/cats/bob~cat')) return {ok:false,status:403,json:async()=>({error:'只有创建者可以修改猫咪基础资料'})}
            else if(route.endsWith('/cats')) data=[{id:'alice~own',name:'松果',is_mine:true},{id:'bob~cat',name:'年糕',is_mine:false}]
            else if(route.endsWith('/records')) data={id:'record',cat_id:'bob~cat'}
            else throw Error('Unexpected route '+route)
            return {ok:true,json:async()=>data}
        }}
    vm.runInNewContext(fs.readFileSync(file,'utf8'),context)
    context.module.exports.installMeowApi({ipcMain:{removeHandler(){},handle:(name,fn)=>handlers.set(name,fn)},
        app:{getPath:()=>path.join(__dirname,'nonexistent-fixture'),whenReady:()=>Promise.resolve()},dialog:{},safeStorage:{isEncryptionAvailable:()=>false}})
    await assert.rejects(handlers.get('search_cats')(null,'年糕'),/请先登录/)
    await handlers.get('auth-login')(null,{email:'test@example.invalid',password:'password'})
    const cats=await handlers.get('get_cats')()
    assert.equal(cats[0].is_mine,true)
    assert.equal(cats[1].is_mine,false)
    const found=await handlers.get('search_cats')(null,'bob~cat')
    assert.equal(found.items[0].id,'bob~cat')
    assert.ok(calls.some(call=>call.search==='?q=bob~cat&offset=0'))
    const record=await handlers.get('add_record')(null,{cat_id:'bob~cat'})
    assert.equal(record.cat_id,'bob~cat')
    await assert.rejects(handlers.get('update_cat')(null,{id:'bob~cat',cat:{name:'tamper'}}),/只有创建者/)
    assert.ok(calls.some(call=>call.route.endsWith('/cats/bob~cat') && call.method==='PUT'))
})
