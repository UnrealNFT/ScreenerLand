-- ScreenerFun PostgreSQL Database Schema
-- Production-ready schema with all features

-- Users table for profiles
CREATE TABLE IF NOT EXISTS users (
    wallet_address VARCHAR(70) PRIMARY KEY,
    name VARCHAR(100),
    bio TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stories table (videos/images with engagement)
CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    user_wallet VARCHAR(70) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
    token_hash VARCHAR(100) NOT NULL,
    token_symbol VARCHAR(20),
    token_logo TEXT,
    caption TEXT,
    video_url TEXT NOT NULL,
    media_type VARCHAR(20) DEFAULT 'video',
    overlay_text VARCHAR(100),
    music_url TEXT,
    duration INTEGER,
    score INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    is_eligible_reward BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast token-based queries
CREATE INDEX IF NOT EXISTS idx_stories_token ON stories(token_hash);
CREATE INDEX IF NOT EXISTS idx_stories_created ON stories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_wallet);

-- Likes table (many-to-many)
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_wallet VARCHAR(70) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(story_id, user_wallet)
);

CREATE INDEX IF NOT EXISTS idx_likes_story ON likes(story_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_wallet);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_wallet VARCHAR(70) NOT NULL,
    user_name VARCHAR(100),
    text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comments_story ON comments(story_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);

-- Views table (tracking views with 30s rate limit)
CREATE TABLE IF NOT EXISTS views (
    id SERIAL PRIMARY KEY,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_wallet VARCHAR(70),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_views_story ON views(story_id);
CREATE INDEX IF NOT EXISTS idx_views_wallet_time ON views(story_id, user_wallet, created_at);

-- Shares table (1 max per wallet per story)
CREATE TABLE IF NOT EXISTS shares (
    id SERIAL PRIMARY KEY,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_wallet VARCHAR(70),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(story_id, user_wallet)
);

CREATE INDEX IF NOT EXISTS idx_shares_story ON shares(story_id);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    token_hash VARCHAR(100) NOT NULL,
    user_wallet VARCHAR(70) NOT NULL,
    user_name VARCHAR(100),
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_token ON chat_messages(token_hash);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);

-- CTO Access table (Chief Token Officer management)
CREATE TABLE IF NOT EXISTS cto_access (
    id SERIAL PRIMARY KEY,
    token_hash VARCHAR(100) NOT NULL,
    wallet_address VARCHAR(70) NOT NULL,
    paid_amount DECIMAL(20, 2) DEFAULT 1000,
    transaction_hash VARCHAR(100),
    network VARCHAR(20) DEFAULT 'mainnet',
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(token_hash, wallet_address)
);

-- Add network column if it doesn't exist (for existing databases)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='cto_access' AND column_name='network'
    ) THEN
        ALTER TABLE cto_access ADD COLUMN network VARCHAR(20) DEFAULT 'mainnet';
        UPDATE cto_access SET network = 'testnet' WHERE transaction_hash IN (
            SELECT transaction_hash FROM cto_access WHERE granted_at < '2025-12-21 16:00:00'
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cto_token ON cto_access(token_hash);
CREATE INDEX IF NOT EXISTS idx_cto_wallet ON cto_access(wallet_address);
CREATE INDEX IF NOT EXISTS idx_cto_transaction ON cto_access(transaction_hash);

-- Token hash mapping (package hash <-> contract hash)
CREATE TABLE IF NOT EXISTS token_hash_mapping (
    package_hash VARCHAR(100) PRIMARY KEY,
    contract_hash VARCHAR(100) NOT NULL,
    token_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mapping_contract ON token_hash_mapping(contract_hash);

-- Reports table (user reports for content moderation)
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    reporter_wallet VARCHAR(70) NOT NULL,
    reason VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    resolved_by VARCHAR(70),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_story ON reports(story_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cto_activity ON cto_access(last_activity DESC);

-- Token Info table (Website, X, Telegram, Banner)
CREATE TABLE IF NOT EXISTS token_info (
    token_hash VARCHAR(100) PRIMARY KEY,
    website TEXT,
    x_url TEXT,
    telegram_url TEXT,
    banner_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_token_info_hash ON token_info(token_hash);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for token_info table
DROP TRIGGER IF EXISTS update_token_info_updated_at ON token_info;
CREATE TRIGGER update_token_info_updated_at BEFORE UPDATE ON token_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
