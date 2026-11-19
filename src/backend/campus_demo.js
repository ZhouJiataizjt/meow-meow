const { loadAreasData } = require('./areas')
const { detectArea, pointInPolygon, haversineMeters, parseRecordTime } = require('./utils')
const BATCH = 'xiaoguwei-demo-v1'
function campusDemoData(now = new Date()) {
    const data = loadAreasData()
    const targets = []
    for (const university of data.universities) for (const campus of university.campuses || []) {
        if (!/大学城|东校园/.test(campus.name)) continue
        const rings = campus.polygons_gcj02 || []
        const points = rings.flat()
        if (!points.length) continue
        const mean = points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0])
        if (mean[0]<23.02 || mean[0]>23.08 || mean[1]<113.35 || mean[1]>113.43) continue
        const minLat=Math.min(...points.map(p=>p[0])),maxLat=Math.max(...points.map(p=>p[0]))
        const minLng=Math.min(...points.map(p=>p[1])),maxLng=Math.max(...points.map(p=>p[1]))
        const candidates=[]
        for(let y=1;y<22;y++) for(let x=1;x<22;x++) {
            const point=[minLat+(maxLat-minLat)*y/22,minLng+(maxLng-minLng)*x/22]
            if(!rings.some(r=>pointInPolygon(point[0],point[1],r)))continue
            const match=detectArea(data,...point)
            if(match?.university===university.name && match?.campus===campus.name)candidates.push(point)
        }
        candidates.sort((a,b)=>haversineMeters(...a,...mean)-haversineMeters(...b,...mean))
        const chosen=[]
        for(const point of candidates) if(chosen.every(p=>haversineMeters(...p,...point)>180)) {chosen.push(point);if(chosen.length===3)break}
        if(chosen.length!==3)throw Error('校园内可用示例点不足：'+university.name)
        targets.push({ university:university.name,campus:campus.name,points:chosen })
    }
    const cats=[],records=[]
    const breeds=['橘白猫','狸花猫','奶牛猫','黑猫']
    const names = {
        '橘白猫': ['年糕','南瓜','蛋挞','柚子','奶黄','布丁','橘宝','麦芽','芝士'],
        '狸花猫': ['松果','虎仔','阿栗','麦穗','榛子','花卷','斑斑','栗酥','小满'],
        '奶牛猫': ['奥利奥','奶盖','棋子','墨点','豆花','汤圆','花生','饭团','云朵'],
        '黑猫': ['乌梅','芝麻','煤球','墨墨','黑糖','夜豆','玄米','小夜','可可']
    }
    const nameCounts = Object.fromEntries(breeds.map(breed => [breed, 0]))
    targets.forEach((target,i)=>target.points.forEach((point,j)=>{
        const id=`${BATCH}-${i}-${j}`
        const date=new Date(now);date.setDate(date.getDate()-(i*3+j)%27);date.setHours([8,13,18][j],15+i%4*10,0,0)
        // time is observation time; created_at remains the server's creation timestamp.
        if(date>now)date.setDate(date.getDate()-1)
        const catId=`${BATCH}-cat-${i}-${j}`
        const species=breeds[(i+j)%breeds.length]
        cats.push({ id:catId,name:names[species][nameCounts[species]++],species,features:`${target.university}的${species}（模拟档案）`,notes:'非真实猫咪档案；与校园示例记录关联。',avatar:j%2?'builtin:cat2':'builtin:cat',is_demo:true,demo_batch:BATCH })
        records.push({ id,cat_id:catId,title:`【示例】${target.university}·观察点 ${j+1}`,desc:'校园内模拟观察点，仅用于测试分布、统计和定位，不代表真实猫咪位置。',species,count:j+1,lat:point[0],lng:point[1],time:date.toISOString(),area:target.university+'·'+target.campus,university:target.university,campus:target.campus,is_demo:true,demo_batch:BATCH,images:[] })
    }))
    return { cats,records,campuses:targets.map(t=>t.university),batch:BATCH }
}
function activityAnalytics(records, now=new Date()) {
    const days=[]
    const dayKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    for(let i=27;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);days.push({date:dayKey(d),count:0})}
    const dayMap=new Map(days.map(d=>[d.date,d]))
    const heat=Array.from({length:7},()=>new Array(24).fill(0))
    const weekdays=new Array(7).fill(0)
    const campuses=new Map(),species=new Map()
    for(const record of records){
        const time=parseRecordTime(record)
        if(time>0){const d=new Date(time);if(dayMap.has(dayKey(d)))dayMap.get(dayKey(d)).count++;const weekday=(d.getDay()+6)%7;heat[weekday][d.getHours()]++;weekdays[weekday]++}
        const area=record.university||String(record.area||'').split('·')[0]||'未标注校园';campuses.set(area,(campuses.get(area)||0)+1)
        const breed=record.species||'未识别品种';species.set(breed,(species.get(breed)||0)+1)
    }
    const rows=map=>[...map].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-CN'))
    return {days,heat,weekdays:weekdays.map((count,i)=>({name:['周一','周二','周三','周四','周五','周六','周日'][i],count})),campuses:rows(campuses),species:rows(species),demoCount:records.filter(r=>r.is_demo).length}
}
module.exports={campusDemoData,activityAnalytics}
