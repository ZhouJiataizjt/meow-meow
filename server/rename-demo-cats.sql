-- Rename only unchanged, explicitly marked campus demonstration profiles.
-- IDs, observation associations and user-chosen names are preserved.
START TRANSACTION;
UPDATE entries e JOIN (
SELECT 'xiaoguwei-demo-v1-cat-0-0' AS id, '年糕' AS name, '示例猫·1-1' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-0-1' AS id, '松果' AS name, '示例猫·1-2' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-0-2' AS id, '奥利奥' AS name, '示例猫·1-3' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-1-0' AS id, '虎仔' AS name, '示例猫·2-1' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-1-1' AS id, '奶盖' AS name, '示例猫·2-2' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-1-2' AS id, '乌梅' AS name, '示例猫·2-3' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-2-0' AS id, '棋子' AS name, '示例猫·3-1' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-2-1' AS id, '芝麻' AS name, '示例猫·3-2' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-2-2' AS id, '南瓜' AS name, '示例猫·3-3' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-3-0' AS id, '煤球' AS name, '示例猫·4-1' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-3-1' AS id, '蛋挞' AS name, '示例猫·4-2' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-3-2' AS id, '阿栗' AS name, '示例猫·4-3' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-4-0' AS id, '柚子' AS name, '示例猫·5-1' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-4-1' AS id, '麦穗' AS name, '示例猫·5-2' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-4-2' AS id, '墨点' AS name, '示例猫·5-3' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-5-0' AS id, '榛子' AS name, '示例猫·6-1' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-5-1' AS id, '豆花' AS name, '示例猫·6-2' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-5-2' AS id, '墨墨' AS name, '示例猫·6-3' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-6-0' AS id, '汤圆' AS name, '示例猫·7-1' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-6-1' AS id, '黑糖' AS name, '示例猫·7-2' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-6-2' AS id, '奶黄' AS name, '示例猫·7-3' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-7-0' AS id, '夜豆' AS name, '示例猫·8-1' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-7-1' AS id, '布丁' AS name, '示例猫·8-2' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-7-2' AS id, '花卷' AS name, '示例猫·8-3' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-8-0' AS id, '橘宝' AS name, '示例猫·9-1' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-8-1' AS id, '斑斑' AS name, '示例猫·9-2' AS old_name
UNION ALL
SELECT 'xiaoguwei-demo-v1-cat-8-2' AS id, '花生' AS name, '示例猫·9-3' AS old_name
) n ON n.id=e.id
SET e.payload=JSON_SET(e.payload,'$.name',n.name)
WHERE e.kind='cats' AND JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.is_demo'))='true'
AND JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.name'))=n.old_name;
SELECT ROW_COUNT() AS renamed_demo_cats;
COMMIT;
