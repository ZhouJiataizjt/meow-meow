const test=require('node:test')
const assert=require('node:assert/strict')
const {campusDemoData,activityAnalytics}=require('../src/backend/campus_demo')
const {loadAreasData}=require('../src/backend/areas')
const {detectArea,haversineMeters}=require('../src/backend/utils')
test('校园示例覆盖9所岛内大学，每校3点，均位于对应GCJ02校园范围且分散',()=>{
 const now=new Date(2026,10,17,21)
 const demo=campusDemoData(now),areas=loadAreasData()
 assert.equal(demo.campuses.length,9);assert.equal(demo.records.length,27)
 const ids=new Set(demo.records.map(r=>r.id));assert.equal(ids.size,27)
 assert.deepEqual(campusDemoData(now).records,demo.records)
 for(const campus of demo.campuses){
  const rows=demo.records.filter(r=>r.university===campus);assert.equal(rows.length,3)
  for(const row of rows){assert.equal(detectArea(areas,row.lat,row.lng)?.university,campus);assert.ok(row.is_demo);assert.ok(new Date(row.time)<=now);assert.ok(demo.cats.some(c=>c.id===row.cat_id))}
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)assert.ok(haversineMeters(rows[i].lat,rows[i].lng,rows[j].lat,rows[j].lng)>180)
 }
})
test('活动图表按记录条数计算，分辨示例，不把只次作为记录条数',()=>{
 const now=new Date(2026,10,17,21),rows=[{time:new Date(2026,10,17,8).toISOString(),count:9,university:'A',species:'橘猫',is_demo:true},{time:new Date(2026,10,16,18).toISOString(),count:1,university:'B',species:'黑猫'}]
 const stats=activityAnalytics(rows,now)
 assert.equal(stats.days.length,28)
 assert.equal(stats.days.reduce((s,d)=>s+d.count,0),2)
 assert.equal(stats.heat.flat().reduce((s,n)=>s+n,0),2)
 assert.equal(stats.weekdays.reduce((s,d)=>s+d.count,0),2)
 assert.equal(stats.demoCount,1)
 assert.equal(stats.campuses.length,2)
 assert.equal(activityAnalytics([],now).heat.flat().reduce((s,n)=>s+n,0),0)
})
