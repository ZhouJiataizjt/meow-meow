USE meow_map;
CREATE TABLE IF NOT EXISTS user_profiles (
 user_id CHAR(36) PRIMARY KEY, username VARCHAR(120) NOT NULL,
 avatar_url TEXT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SET @meow_profile_ddl = IF(
    EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'user_profiles' AND column_name = 'avatar_url'),
    'SELECT 1',
    'ALTER TABLE user_profiles ADD COLUMN avatar_url TEXT NULL'
);
PREPARE meow_profile_statement FROM @meow_profile_ddl;
EXECUTE meow_profile_statement;
DEALLOCATE PREPARE meow_profile_statement;
