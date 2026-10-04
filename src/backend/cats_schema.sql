-- 猫咪档案功能所需的数据库结构更新
-- 运行方式同 supabase_schema_update.sql：在 Supabase 控制台 SQL Editor 中执行

-- 猫咪档案表：把多次目击归到同一只猫下
CREATE TABLE IF NOT EXISTS cats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    species TEXT,
    features TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own cats" ON cats;
DROP POLICY IF EXISTS "Users can insert their own cats" ON cats;
DROP POLICY IF EXISTS "Users can update their own cats" ON cats;
DROP POLICY IF EXISTS "Users can delete their own cats" ON cats;

CREATE POLICY "Users can view their own cats" ON cats
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cats" ON cats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cats" ON cats
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cats" ON cats
    FOR DELETE USING (auth.uid() = user_id);

-- 观察记录与地图记录增加档案关联字段（本地模式中该字段为任意 id，云端为 uuid）
ALTER TABLE records ADD COLUMN IF NOT EXISTS cat_id UUID REFERENCES cats(id) ON DELETE SET NULL;
ALTER TABLE map_records ADD COLUMN IF NOT EXISTS cat_id UUID REFERENCES cats(id) ON DELETE SET NULL;
