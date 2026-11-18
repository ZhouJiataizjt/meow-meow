CREATE DATABASE IF NOT EXISTS meow_map CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE meow_map;
CREATE TABLE IF NOT EXISTS users (
 id CHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36) NOT NULL,
 expires_at DATETIME NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX (expires_at)
);
-- Each kind has a separate namespace. JSON preserves the existing desktop fields.
CREATE TABLE IF NOT EXISTS entries (
 user_id CHAR(36) NOT NULL, kind VARCHAR(20) NOT NULL, id VARCHAR(80) NOT NULL,
 payload JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (user_id, kind, id),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS uploads (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, mime VARCHAR(40) NOT NULL,
 size INT UNSIGNED NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS likes (
 owner_id CHAR(36) NOT NULL, kind VARCHAR(20) NOT NULL DEFAULT 'map_records',
 record_id VARCHAR(80) NOT NULL, user_id CHAR(36) NOT NULL,
 PRIMARY KEY(owner_id,kind,record_id,user_id),
 FOREIGN KEY(owner_id,kind,record_id) REFERENCES entries(user_id,kind,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS comments (
 id CHAR(36) PRIMARY KEY, owner_id CHAR(36) NOT NULL,
 kind VARCHAR(20) NOT NULL DEFAULT 'map_records', record_id VARCHAR(80) NOT NULL,
 user_id CHAR(36) NOT NULL, content VARCHAR(1000) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(owner_id,kind,record_id,created_at),
 FOREIGN KEY(owner_id,kind,record_id) REFERENCES entries(user_id,kind,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_profiles (
 user_id CHAR(36) PRIMARY KEY, username VARCHAR(120) NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
