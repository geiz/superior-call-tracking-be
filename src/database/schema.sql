-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================
-- ENUMS FOR CLEANER DATA TYPES
-- =====================================================

-- User roles
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'user', 'agent');

-- Company status
CREATE TYPE company_status AS ENUM ('active', 'inactive', 'suspended', 'cancelled', 'trial');

-- Call status
CREATE TYPE call_status AS ENUM (
    'ringing', 
    'in_progress', 
    'completed', 
    'failed', 
    'busy', 
    'no_answer', 
    'canceled', 
    'voicemail',
    'missed'
);


-- Call direction
CREATE TYPE call_direction AS ENUM ('inbound', 'outbound');

-- Call disposition
CREATE TYPE call_disposition AS ENUM (
    'new',
    'answered',
    'answered_ai', 
    'voicemail', 
    'abandoned', 
    'blocked', 
    'missed'
);

-- Agent status
CREATE TYPE agent_status AS ENUM ('available', 'busy', 'away', 'offline', 'in_call');

-- Lead status
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'unqualified', 'lost', 'customer');

-- Lifecycle stage
CREATE TYPE lifecycle_stage AS ENUM ('subscriber', 'lead', 'opportunity', 'customer', 'evangelist');

-- Text message direction
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

-- Text message status
CREATE TYPE message_status AS ENUM (
    'pending', 
    'sending', 
    'sent', 
    'delivered', 
    'failed', 
    'received', 
    'read'
);

-- Conversation status
CREATE TYPE conversation_status AS ENUM ('active', 'archived', 'spam');

-- Webhook status
CREATE TYPE webhook_status AS ENUM ('active', 'inactive', 'failed');

-- Webhook status
CREATE TYPE webhook_event AS ENUM ('call.started', 'call.completed', 'call.recorded', 'text.received', 'text.sent', 'lead.created', 'form.submitted');

-- Webhook delivery status
CREATE TYPE delivery_status AS ENUM (
    'pending', 
    'in_progress', 
    'success', 
    'failed', 
    'retry'
);

-- Agent status
CREATE TYPE agent_status AS ENUM (
    'available', 
    'busy', 
    'away', 
    'offline', 
    'in_call'
);

-- =====================================================
-- CORE ACCOUNT STRUCTURE
-- =====================================================

-- Companies (Multi-tenant support)
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE,
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    industry VARCHAR(100),
    website VARCHAR(255),

    -- SIP/PBX Configuration
    sip_domain VARCHAR(255) NOT NULL,
    sip_username VARCHAR(100),
    sip_password VARCHAR(255),
    sip_transport VARCHAR(10) DEFAULT 'UDP',
    sip_port INTEGER DEFAULT 5060,

    -- Call Flow Defaults
    default_timeout_seconds INTEGER DEFAULT 30,
    voicemail_enabled BOOLEAN DEFAULT true,
    voicemail_transcription BOOLEAN DEFAULT true,
    recording_enabled BOOLEAN DEFAULT true,
    recording_disclaimer BOOLEAN DEFAULT true,

    
    -- Account settings
    settings JSONB DEFAULT '{
        "caller_id_lookup": true,
        "spam_detection": true,
        "call_scoring": true
    }'::jsonb,
    
    -- Billing
    plan_type VARCHAR(50) DEFAULT 'starter',
    billing_email VARCHAR(255),
    monthly_minutes_limit INTEGER DEFAULT 100000,
    monthly_texts_limit INTEGER DEFAULT 100000,
    
    -- Status
    status company_status DEFAULT 'active',
    trial_ends_at TIMESTAMP,
    suspended_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role user_role DEFAULT 'user',
    phone VARCHAR(20),
    extension VARCHAR(10),
    
    -- SIP credentials for agents
    sip_username VARCHAR(100) UNIQUE,
    sip_password VARCHAR(255),
    sip_realm VARCHAR(255),
    
    -- Preferences
    preferences JSONB DEFAULT '{
        "notifications": {
            "email": true,
            "sms": false,
            "desktop": true
        },
        "timezone": null
    }'::jsonb,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    last_activity TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tags
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6',
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    is_auto_tag BOOLEAN DEFAULT false,
    auto_tag_rules JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    deleted_by INTEGER REFERENCES users(id),
    UNIQUE(company_id, name, is_deleted)
);

-- Tracking Numbers
CREATE TABLE tracking_numbers (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Number details
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    friendly_name VARCHAR(255),
    description TEXT,
    type VARCHAR(50) DEFAULT 'local',
    country_code VARCHAR(2) DEFAULT 'US',
    
    -- SIP Routing
    sip_uri VARCHAR(255),
    
    -- Source tracking
    source VARCHAR(100) NOT NULL,
    medium VARCHAR(100),
    campaign VARCHAR(255),
    campaign_id VARCHAR(100),
    
    -- Call flow configuration
    call_flow JSONB DEFAULT '{
        "record_calls": true,
        "timeout_seconds": 30,
        "voicemail_enabled": true,
        "voicemail_greeting": "Please leave a message after the beep.",
        "voicemail_transcribe": true
    }'::jsonb,
    
    -- Provider details
    provider VARCHAR(50),
    provider_sid VARCHAR(100),
    monthly_fee DECIMAL(10,2) DEFAULT 0,
    per_minute_rate DECIMAL(10,4) DEFAULT 0,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP,
    
    -- SMS capabilities
    sms_enabled BOOLEAN DEFAULT false,
    sms_webhook_url VARCHAR(500),
    
    -- Statistics
    total_calls INTEGER DEFAULT 0,
    total_minutes INTEGER DEFAULT 0,
    last_call_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Agent Sessions
CREATE TABLE agent_sessions (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Session details
    session_id VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    socket_id VARCHAR(255),
    
    -- Status tracking
    status agent_status DEFAULT 'available',
    is_online BOOLEAN DEFAULT true,
    
    -- Activity tracking
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    
    -- Call handling (will be set after calls table exists)
    current_call_id INTEGER,
    calls_handled INTEGER DEFAULT 0,
    avg_handle_time INTEGER DEFAULT 0,
    
    -- Break tracking
    break_start TIMESTAMP,
    break_reason VARCHAR(100),
    total_break_time INTEGER DEFAULT 0,
    
    -- Capacity
    max_concurrent_calls INTEGER DEFAULT 1,
    current_concurrent_calls INTEGER DEFAULT 0,
    
    -- Queue settings
    queue_priorities JSONB DEFAULT '[]'::jsonb,
    skills JSONB DEFAULT '[]'::jsonb,
    
    -- Stats for this session
    total_talk_time INTEGER DEFAULT 0,
    total_idle_time INTEGER DEFAULT 0,
    total_wrap_time INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE calls (
    -- Primary identifiers
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
    call_sid VARCHAR(100) NOT NULL UNIQUE,
    
    -- Company and tracking
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    tracking_number_id INTEGER REFERENCES tracking_numbers(id),
    
    -- Caller information
    caller_number VARCHAR(20) NOT NULL,
    caller_name VARCHAR(255),
    caller_city VARCHAR(100),
    caller_state VARCHAR(50),
    caller_country VARCHAR(50),
    caller_zip VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Call details
    destination_number VARCHAR(20),
    forwarding_number VARCHAR(20),
    
    -- Timing
    start_time TIMESTAMP NOT NULL,
    answer_time TIMESTAMP,
    end_time TIMESTAMP,
    duration INTEGER DEFAULT 0,
    talk_time INTEGER DEFAULT 0,
    ring_time INTEGER DEFAULT 0,
    hold_time INTEGER DEFAULT 0,
    queue_time INTEGER DEFAULT 0,
    
    -- Status and direction
    direction call_direction DEFAULT 'inbound',
    status call_status NOT NULL,
    disposition call_disposition,
    hangup_cause VARCHAR(100),
    
    -- Agent handling
    agent_id INTEGER REFERENCES users(id),
    agent_session_id INTEGER REFERENCES agent_sessions(id),
    assigned_to INTEGER REFERENCES users(id),
    
    -- Voicemail
    voicemail_url VARCHAR(500),
    
    -- Spam detection
    is_spam BOOLEAN DEFAULT false,
    spam_score DECIMAL(3, 2),
    
    -- Lead tracking
    is_first_call BOOLEAN DEFAULT false,
    first_call_id INTEGER,
    lead_status lead_status,
    lead_score INTEGER,
    has_value BOOLEAN DEFAULT false,
    value DECIMAL(10, 2),
    revenue DECIMAL(10, 2),
    
    -- Recording
    recording_enabled BOOLEAN DEFAULT true,
    recording_url VARCHAR(500),
    recording_key VARCHAR(500),

    recording_duration INTEGER,
    transcription_enabled BOOLEAN DEFAULT false,
    transcription_status VARCHAR(50),
    transcription TEXT,
    transcription_confidence DECIMAL(3, 2),
    
    -- AI Analysis
    sentiment VARCHAR(20),
    sentiment_score DECIMAL(3, 2),
    talk_to_listen_ratio DECIMAL(3, 2),
    keywords_detected TEXT[],
    
    -- Quality
    call_quality_score INTEGER,
    audio_quality VARCHAR(50),
    
    -- SIP details
    sip_call_id VARCHAR(255),
    sip_from_uri VARCHAR(255),
    sip_to_uri VARCHAR(255),
    codec VARCHAR(50),
    
    -- Source tracking
    source VARCHAR(100),
    medium VARCHAR(100),
    campaign VARCHAR(255),
    keyword VARCHAR(255),
    landing_page VARCHAR(500),
    referrer VARCHAR(500),
    gclid VARCHAR(255),
    fbclid VARCHAR(255),
    msclkid VARCHAR(255),
    visitor_id UUID,
    
    -- Additional fields
    notes TEXT,
    custom_fields JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    tags JSONB DEFAULT '[]',
    
    -- Timestamps
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


DROP TABLE IF EXISTS calls CASCADE;

-- Add self-referencing foreign key
ALTER TABLE calls ADD CONSTRAINT calls_first_call_id_fkey 
    FOREIGN KEY (first_call_id) REFERENCES calls(id);

-- Add foreign key from agent_sessions to calls
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_current_call_id_fkey 
    FOREIGN KEY (current_call_id) REFERENCES calls(id);

-- Call Recordings
CREATE TABLE call_recordings (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
    
    -- File information
    file_path VARCHAR(500),
    file_url VARCHAR(500),
    file_size BIGINT,
    duration INTEGER,
    format VARCHAR(20) DEFAULT 'mp3',
    channels INTEGER DEFAULT 1,
    sample_rate INTEGER DEFAULT 16000,
    bit_rate INTEGER DEFAULT 128,
    
    -- Processing
    waveform_data JSONB,
    transcription_text TEXT,
    transcription_job_id VARCHAR(100),
    
    -- Storage
    storage_provider VARCHAR(50) DEFAULT 'local',
    storage_bucket VARCHAR(255),
    storage_key VARCHAR(500),
    
    -- Encryption
    encrypted BOOLEAN DEFAULT false,
    encryption_key VARCHAR(255),
    
    -- Retention
    retention_days INTEGER DEFAULT 90,
    delete_after TIMESTAMP,
    archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Call Tags (Many-to-many)
CREATE TABLE call_tags (
    id SERIAL PRIMARY KEY,
    call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    applied_by INTEGER REFERENCES users(id),
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    auto_applied BOOLEAN DEFAULT false,
    UNIQUE(call_id, tag_id)
);

-- Agent Status History
CREATE TABLE agent_status_history (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES agent_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status agent_status NOT NULL,
    reason VARCHAR(255),
    duration INTEGER,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- SIP Events
CREATE TABLE sip_events (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    call_id INTEGER REFERENCES calls(id),
    
    -- Event details
    event_type VARCHAR(50) NOT NULL,
    event_timestamp TIMESTAMP NOT NULL,
    event_data JSONB NOT NULL,
    
    -- SIP details
    sip_call_id VARCHAR(100),
    from_uri VARCHAR(255),
    to_uri VARCHAR(255),
    
    -- Processing
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Text Conversations
CREATE TABLE text_conversations (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    tracking_number_id INTEGER REFERENCES tracking_numbers(id),
    
    -- Participants
    customer_number VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255),
    
    -- Status
    status conversation_status DEFAULT 'active',
    unread_count INTEGER DEFAULT 0,
    
    -- Agent assignment
    assigned_agent_id INTEGER REFERENCES users(id),
    last_agent_id INTEGER REFERENCES users(id),
    
    -- Metadata
    source VARCHAR(100),
    first_message_at TIMESTAMP,
    last_message_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(company_id, tracking_number_id, customer_number)
);

-- Text Messages
CREATE TABLE text_messages (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    conversation_id INTEGER REFERENCES text_conversations(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Message details
    message_sid VARCHAR(100) UNIQUE,
    direction message_direction NOT NULL,
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    body TEXT NOT NULL,
    
    -- Media (MMS)
    media_urls TEXT[],
    media_count INTEGER DEFAULT 0,
    
    -- Status
    status message_status DEFAULT 'sent',
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Agent handling
    agent_id INTEGER REFERENCES users(id),
    agent_session_id INTEGER REFERENCES agent_sessions(id),
    read_at TIMESTAMP,
    
    -- Analysis
    sentiment VARCHAR(20),
    contains_question BOOLEAN DEFAULT false,
    urgent BOOLEAN DEFAULT false,
    
    -- Provider
    provider VARCHAR(50),
    provider_cost DECIMAL(10,4),
    
    -- Timestamps
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer Profiles
CREATE TABLE customer_profiles (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Identity
    phone_number VARCHAR(20),
    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company VARCHAR(255),
    
    -- Location
    city VARCHAR(100),
    state VARCHAR(50),
    country VARCHAR(50),
    timezone VARCHAR(50),
    
    -- Lead info
    lead_score INTEGER DEFAULT 0,
    lead_status lead_status DEFAULT 'new',
    lifecycle_stage lifecycle_stage DEFAULT 'subscriber',
    
    -- Engagement
    first_contact_at TIMESTAMP,
    last_contact_at TIMESTAMP,
    total_calls INTEGER DEFAULT 0,
    total_texts INTEGER DEFAULT 0,
    total_forms INTEGER DEFAULT 0,
    total_page_views INTEGER DEFAULT 0,
    
    -- Value
    lifetime_value DECIMAL(10,2) DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    average_order_value DECIMAL(10,2) DEFAULT 0,
    
    -- Attribution
    acquisition_source VARCHAR(100),
    acquisition_medium VARCHAR(100),
    acquisition_campaign VARCHAR(255),
    acquisition_date DATE,
    
    -- Custom fields
    custom_fields JSONB DEFAULT '{}'::jsonb,
    
    -- External IDs
    crm_id VARCHAR(100),
    external_ids JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(company_id, phone_number),
    UNIQUE(company_id, email)
);

-- Visitors (For customer journey tracking)
CREATE TABLE visitors (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    visitor_id VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    email VARCHAR(255),
    merged_with_id INTEGER REFERENCES visitors(id),
    first_visit_at TIMESTAMP NOT NULL,
    first_source VARCHAR(100),
    first_medium VARCHAR(100),
    first_campaign VARCHAR(255),
    first_landing_page VARCHAR(500),
    ip_address INET,
    country VARCHAR(50),
    region VARCHAR(100),
    city VARCHAR(100),
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(50),
    os VARCHAR(50),
    page_views INTEGER DEFAULT 0,
    total_time_on_site INTEGER DEFAULT 0,
    last_visit_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, visitor_id)
);

-- Page Views
CREATE TABLE page_views (
    id SERIAL PRIMARY KEY,
    visitor_id INTEGER REFERENCES visitors(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    page_url VARCHAR(500) NOT NULL,
    page_title VARCHAR(255),
    referrer VARCHAR(500),
    timestamp TIMESTAMP NOT NULL,
    time_on_page INTEGER,
    scroll_depth INTEGER,
    clicks INTEGER DEFAULT 0,
    form_starts INTEGER DEFAULT 0,
    form_completions INTEGER DEFAULT 0,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Form Submissions
CREATE TABLE form_submissions (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    visitor_id INTEGER REFERENCES visitors(id),
    
    -- Form identification
    form_id VARCHAR(100),
    form_name VARCHAR(255),
    page_url VARCHAR(500),
    
    -- Submitted data (flexible JSON storage)
    fields JSONB NOT NULL,
    
    -- Extracted contact info for easy querying
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    company VARCHAR(255),
    
    -- Attribution tracking
    source VARCHAR(100),
    medium VARCHAR(100),
    campaign VARCHAR(255),
    
    -- Click tracking IDs
    gclid VARCHAR(255), -- Google Click ID
    fbclid VARCHAR(255), -- Facebook Click ID
    
    -- Status and assignment
    status VARCHAR(50) DEFAULT 'new', -- new, contacted, qualified, unqualified
    assigned_to INTEGER REFERENCES users(id),
    
    -- Timestamps
    submitted_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhooks
CREATE TABLE webhooks (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Configuration
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    events TEXT[] NOT NULL,
    
    -- Authentication
    auth_type VARCHAR(50),
    auth_credentials TEXT,
    signing_secret VARCHAR(255),
    
    -- Headers
    custom_headers JSONB DEFAULT '{}'::jsonb,
    
    -- Options
    status webhook_status DEFAULT 'active',
    retry_on_failure BOOLEAN DEFAULT true,
    max_retries INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 60,
    timeout_seconds INTEGER DEFAULT 30,
    
    -- Rate limiting
    rate_limit_per_minute INTEGER DEFAULT 60,
    
    -- Status tracking
    last_triggered_at TIMESTAMP,
    last_status_code INTEGER,
    consecutive_failures INTEGER DEFAULT 0,
    total_deliveries INTEGER DEFAULT 0,
    successful_deliveries INTEGER DEFAULT 0,
    
    -- Circuit breaker
    circuit_breaker_threshold INTEGER DEFAULT 5,
    circuit_breaker_reset_after INTEGER DEFAULT 300,
    circuit_opened_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhook Deliveries
CREATE TABLE webhook_deliveries (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER REFERENCES webhooks(id) ON DELETE CASCADE,
    
    -- Delivery details
    delivery_id UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_id VARCHAR(100),
    
    -- Payload
    payload JSONB NOT NULL,
    headers_sent JSONB,
    
    -- Delivery attempt
    attempt_number INTEGER DEFAULT 1,
    status delivery_status DEFAULT 'pending',
    
    -- Request details
    request_sent_at TIMESTAMP,
    request_method VARCHAR(10) DEFAULT 'POST',
    
    -- Response details
    response_received_at TIMESTAMP,
    response_status_code INTEGER,
    response_headers JSONB,
    response_body TEXT,
    response_time_ms INTEGER,
    
    -- Error tracking
    error_message TEXT,
    error_details JSONB,
    
    -- Retry information
    retry_after TIMESTAMP,
    retried_from_id INTEGER REFERENCES webhook_deliveries(id),
    
    -- Metadata
    ip_address INET,
    dns_lookup_ms INTEGER,
    tcp_connect_ms INTEGER,
    tls_handshake_ms INTEGER,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Calls indexes
CREATE INDEX idx_calls_company_start ON calls(company_id, start_time DESC);
CREATE INDEX idx_calls_tracking_number ON calls(tracking_number_id, start_time DESC);
CREATE INDEX idx_calls_caller ON calls(caller_number, company_id);
CREATE INDEX idx_calls_status ON calls(status, company_id);
CREATE INDEX idx_calls_source ON calls(source, medium, campaign);
CREATE INDEX idx_calls_agent_session ON calls(agent_session_id);
CREATE INDEX idx_calls_created ON calls(created_at DESC);
CREATE INDEX idx_calls_company_id ON calls(company_id);
CREATE INDEX idx_calls_tracking_number_id ON calls(tracking_number_id);
CREATE INDEX idx_calls_start_time ON calls(start_time);
CREATE INDEX idx_calls_caller_number ON calls(caller_number);
CREATE INDEX idx_calls_direction ON calls(direction);
CREATE INDEX idx_calls_agent_id ON calls(agent_id);
CREATE INDEX idx_calls_assigned_to ON calls(assigned_to);
CREATE INDEX idx_calls_campaign ON calls(campaign);
CREATE INDEX idx_calls_lead_status ON calls(lead_status);
CREATE INDEX idx_calls_created_at ON calls(created_at);

-- Agent sessions indexes
CREATE INDEX idx_agent_sessions_user ON agent_sessions(user_id) WHERE ended_at IS NULL;
CREATE INDEX idx_agent_sessions_status ON agent_sessions(status) WHERE is_online = true;
CREATE INDEX idx_agent_sessions_company ON agent_sessions(company_id, status) WHERE is_online = true;
CREATE INDEX idx_agent_sessions ON agent_sessions(current_call_id DESC);

-- Text messages indexes
CREATE INDEX idx_texts_conversation ON text_messages(conversation_id, created_at);
CREATE INDEX idx_texts_company ON text_messages(company_id, created_at DESC);

-- Customer profiles indexes
CREATE INDEX idx_customers_phone ON customer_profiles(phone_number);
CREATE INDEX idx_customers_email ON customer_profiles(email);
CREATE INDEX idx_customers_company ON customer_profiles(company_id, lead_status);

-- Tracking numbers indexes
CREATE INDEX idx_tracking_company ON tracking_numbers(company_id, status);
CREATE INDEX idx_tracking_source ON tracking_numbers(source, medium, campaign);

-- Webhook indexes
CREATE INDEX idx_webhooks_company_active ON webhooks(company_id) WHERE status = 'active';
CREATE INDEX idx_webhooks_events ON webhooks USING gin(events);

-- Webhook delivery indexes
CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status) WHERE status IN ('pending', 'retry');

-- Form submission indexes
CREATE INDEX idx_form_submissions_company ON form_submissions(company_id, submitted_at DESC);
CREATE INDEX idx_form_submissions_visitor ON form_submissions(visitor_id);
CREATE INDEX idx_form_submissions_email ON form_submissions(email) WHERE email IS NOT NULL;
CREATE INDEX idx_form_submissions_phone ON form_submissions(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_form_submissions_status ON form_submissions(company_id, status);
CREATE INDEX idx_form_submissions_assigned ON form_submissions(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_form_submissions_source ON form_submissions(company_id, source) WHERE source IS NOT NULL;

-- Full text search on fields
CREATE INDEX idx_form_submissions_fields_gin ON form_submissions USING gin(fields);

-- Create GIN index for JSONB columns
CREATE INDEX idx_calls_custom_fields ON calls USING gin (custom_fields);
CREATE INDEX idx_calls_metadata ON calls USING gin (metadata);

-- Tag Index
CREATE INDEX idx_tags_company_deleted ON tags(company_id, is_deleted);
CREATE INDEX idx_tags_name_search ON tags(company_id, name, is_deleted);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_tracking_numbers_updated_at BEFORE UPDATE ON tracking_numbers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_recordings_updated_at BEFORE UPDATE ON call_recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_text_conversations_updated_at BEFORE UPDATE ON text_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_profiles_updated_at BEFORE UPDATE ON customer_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert default company
INSERT INTO companies (name, subdomain, status, sip_domain) 
VALUES ('Demo Company', 'demo', 'active', 'demo.pbx.example.com');

-- Insert default tags
INSERT INTO tags (company_id, name, color, description) VALUES
    (1, 'new-lead', '#10B981', 'First time caller'),
    (1, 'hot-lead', '#EF4444', 'High intent caller'),
    (1, 'customer', '#3B82F6', 'Existing customer'),
    (1, 'support', '#6366F1', 'Support inquiry'),
    (1, 'spam', '#6B7280', 'Spam or unwanted call');



-- MIGRATION 1

-- DNI Database Schema Migration
-- Add this to your backend/src/database/schema.sql or create a new migration file

-- =====================================================
-- DNI (Dynamic Number Insertion) Tables
-- =====================================================

-- Add DNI fields to companies table if not exists
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS dni_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS dni_session_duration INTEGER DEFAULT 1800, -- 30 minutes in seconds
ADD COLUMN IF NOT EXISTS dni_assignment_strategy VARCHAR(50) DEFAULT 'least_used'; -- least_used, round_robin, sticky

-- Add DNI fields to tracking_numbers table
ALTER TABLE tracking_numbers 
ADD COLUMN IF NOT EXISTS is_pool_number BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS assigned_to_visitor_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS assignment_count INTEGER DEFAULT 0;

-- Add DNI fields to visitors table
ALTER TABLE visitors 
ADD COLUMN IF NOT EXISTS assigned_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS tracking_number_id INTEGER REFERENCES tracking_numbers(id),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS session_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS gclid VARCHAR(255),
ADD COLUMN IF NOT EXISTS fbclid VARCHAR(255),
ADD COLUMN IF NOT EXISTS msclkid VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_term VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_content VARCHAR(255);

-- Visitor Number History (for tracking assignments)
CREATE TABLE IF NOT EXISTS visitor_number_history (
    id SERIAL PRIMARY KEY,
    visitor_id INTEGER REFERENCES visitors(id) ON DELETE CASCADE,
    tracking_number_id INTEGER REFERENCES tracking_numbers(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP,
    source VARCHAR(100),
    medium VARCHAR(100),
    campaign VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- DNI Functions
-- =====================================================

-- Function to get available pool numbers with priority
CREATE OR REPLACE FUNCTION get_available_pool_numbers(
    p_company_id INTEGER,
    p_source VARCHAR DEFAULT NULL,
    p_medium VARCHAR DEFAULT NULL,
    p_campaign VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    tracking_number_id INTEGER,
    phone_number VARCHAR,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tn.id as tracking_number_id,
        tn.phone_number,
        CASE 
            -- Exact match gets highest priority
            WHEN tn.source = p_source AND tn.medium = p_medium AND tn.campaign = p_campaign THEN 1
            -- Source and medium match
            WHEN tn.source = p_source AND tn.medium = p_medium THEN 2
            -- Source only match
            WHEN tn.source = p_source THEN 3
            -- Generic pool numbers
            WHEN tn.source IS NULL OR tn.source = 'pool' THEN 4
            -- Any other pool number
            ELSE 5
        END as priority
    FROM tracking_numbers tn
    WHERE tn.company_id = p_company_id
        AND tn.is_pool_number = true
        AND tn.status = 'active'
        AND (
            tn.assigned_to_visitor_at IS NULL 
            OR tn.assigned_to_visitor_at < NOW() - INTERVAL '30 minutes'
        )
    ORDER BY 
        priority ASC,
        COALESCE(tn.last_assigned_at, '1970-01-01'::timestamp) ASC,
        tn.assignment_count ASC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired assignments
CREATE OR REPLACE FUNCTION cleanup_expired_dni_sessions()
RETURNS INTEGER AS $$
DECLARE
    cleaned_count INTEGER;
BEGIN
    UPDATE tracking_numbers
    SET assigned_to_visitor_at = NULL
    WHERE is_pool_number = true
        AND assigned_to_visitor_at IS NOT NULL
        AND assigned_to_visitor_at < NOW() - 
            (SELECT dni_session_duration || ' seconds'::interval 
             FROM companies 
             WHERE id = tracking_numbers.company_id);
    
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    
    -- Update history
    UPDATE visitor_number_history
    SET released_at = NOW()
    WHERE released_at IS NULL
        AND assigned_at < NOW() - INTERVAL '2 hours';
    
    RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Indexes for DNI
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_tracking_numbers_pool ON tracking_numbers(company_id, is_pool_number, status) 
    WHERE is_pool_number = true;
CREATE INDEX IF NOT EXISTS idx_tracking_numbers_assignment ON tracking_numbers(assigned_to_visitor_at) 
    WHERE is_pool_number = true;
CREATE INDEX IF NOT EXISTS idx_tracking_numbers_source_campaign ON tracking_numbers(company_id, source, medium, campaign) 
    WHERE is_pool_number = true;

CREATE INDEX IF NOT EXISTS idx_visitors_assigned_number ON visitors(company_id, assigned_number);
CREATE INDEX IF NOT EXISTS idx_visitors_tracking_number ON visitors(tracking_number_id);

CREATE INDEX IF NOT EXISTS idx_visitor_number_history_visitor ON visitor_number_history(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_number_history_number ON visitor_number_history(tracking_number_id);
CREATE INDEX IF NOT EXISTS idx_visitor_number_history_released ON visitor_number_history(released_at) 
    WHERE released_at IS NULL;

ALTER TABLE visitors 
ADD COLUMN IF NOT EXISTS first_referrer VARCHAR(500),
ADD COLUMN IF NOT EXISTS tracking_number_id INTEGER REFERENCES tracking_numbers(id);

ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS recording_key VARCHAR(500);

-- MIGRATION 2

-- Update the user_role enum to include new roles
ALTER TYPE user_role RENAME TO user_role_old;

CREATE TYPE user_role AS ENUM ('ADMIN', 'manager', 'reporting', 'agent', 'user');

-- Update existing data
ALTER TABLE users 
  ALTER COLUMN role TYPE user_role 
  USING (
    CASE role::text
      WHEN 'admin' THEN 'ADMIN'::user_role
      WHEN 'manager' THEN 'manager'::user_role
      WHEN 'user' THEN 'user'::user_role
      WHEN 'agent' THEN 'agent'::user_role
      ELSE 'user'::user_role
    END
  );

-- Drop the old enum
DROP TYPE user_role_old;

-- Add new columns to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS personal_note TEXT,
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

-- Create index for created_by
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);

-- Update existing admin users to ADMIN role
UPDATE users SET role = 'ADMIN' WHERE role = 'admin';

-- MIGRATION 3

-- Create invitation status enum
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'cancelled');

-- Create user_invitations table
CREATE TABLE user_invitations (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- User information
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    temp_password VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    phone VARCHAR(20),
    personal_note TEXT,
    
    -- Invitation metadata
    status invitation_status DEFAULT 'pending' NOT NULL,
    invited_by INTEGER NOT NULL REFERENCES users(id),
    accepted_by INTEGER REFERENCES users(id),
    accepted_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    
    -- Email tracking
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMP,
    email_send_attempts INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_invitations_company ON user_invitations(company_id);
CREATE INDEX idx_invitations_email ON user_invitations(email);
CREATE INDEX idx_invitations_status ON user_invitations(status);
CREATE INDEX idx_invitations_expires ON user_invitations(expires_at) WHERE status = 'pending';
CREATE INDEX idx_invitations_invited_by ON user_invitations(invited_by);

-- Create compound index for checking existing invitations
CREATE INDEX idx_invitations_email_status_expires ON user_invitations(email, status, expires_at);

-- Add trigger to update updated_at
CREATE TRIGGER update_user_invitations_updated_at
    BEFORE UPDATE ON user_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Migration 4
-- Create invitation status enum
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'cancelled');

-- Create user_invitations table
CREATE TABLE user_invitations (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- User information
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    temp_password VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    phone VARCHAR(20),
    personal_note TEXT,
    
    -- Link to user record
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- Invitation metadata
    status invitation_status DEFAULT 'pending' NOT NULL,
    invited_by INTEGER NOT NULL REFERENCES users(id),
    accepted_by INTEGER REFERENCES users(id),
    accepted_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    
    -- Email tracking
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMP,
    email_send_attempts INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_invitations_company ON user_invitations(company_id);
CREATE INDEX idx_invitations_email ON user_invitations(email);
CREATE INDEX idx_invitations_status ON user_invitations(status);
CREATE INDEX idx_invitations_expires ON user_invitations(expires_at) WHERE status = 'pending';
CREATE INDEX idx_invitations_invited_by ON user_invitations(invited_by);
CREATE INDEX idx_invitations_user_id ON user_invitations(user_id);

-- Create compound index for checking existing invitations
CREATE INDEX idx_invitations_email_status_expires ON user_invitations(email, status, expires_at);

-- Add trigger to update updated_at
CREATE TRIGGER update_user_invitations_updated_at
    BEFORE UPDATE ON user_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- MIGRATION 5
-- Create accounts table if it doesn't exist
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add account_id to companies table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='companies' 
        AND column_name='account_id'
    ) THEN
        ALTER TABLE companies 
        ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
        
        CREATE INDEX idx_companies_account_id ON companies(account_id);
    END IF;
END $$;

-- Add account_id to users table if needed (for direct account access)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='users' 
        AND column_name='account_id'
    ) THEN
        ALTER TABLE users 
        ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
        
        CREATE INDEX idx_users_account_id ON users(account_id);
    END IF;
END $$;

-- Create trigger to update updated_at for accounts
CREATE OR REPLACE FUNCTION update_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_accounts_updated_at_trigger ON accounts;
CREATE TRIGGER update_accounts_updated_at_trigger
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_accounts_updated_at();

-- MIGRATION 6

-- Add missing timestamp columns to agent_sessions table
ALTER TABLE agent_sessions 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_agent_sessions_updated_at ON agent_sessions;
CREATE TRIGGER update_agent_sessions_updated_at
    BEFORE UPDATE ON agent_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- MIGRATION 7
-- Add subscription and billing fields to accounts table
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS plan_type VARCHAR(50) DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'trialing',
ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS customer_id VARCHAR(255), -- Stripe customer ID
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS monthly_call_limit INTEGER DEFAULT 1000,
ADD COLUMN IF NOT EXISTS monthly_text_limit INTEGER DEFAULT 500,
ADD COLUMN IF NOT EXISTS max_companies INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_users_per_company INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255);

-- Remove billing fields from companies table (they belong to account)
ALTER TABLE companies 
DROP COLUMN IF EXISTS plan_type,
DROP COLUMN IF EXISTS billing_email,
DROP COLUMN IF EXISTS monthly_minutes_limit,
DROP COLUMN IF EXISTS monthly_texts_limit;

-- Add usage tracking to companies
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS monthly_calls_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_texts_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS usage_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Fix user roles enum to match your requirements
DROP TYPE IF EXISTS user_role CASCADE;
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'agent', 'reporting');


-- MIGRATION 8
-- Create user_companies junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS user_companies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    is_default BOOLEAN DEFAULT false,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    invited_by INTEGER REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, company_id)
);

-- Create indexes
CREATE INDEX idx_user_companies_user ON user_companies(user_id);
CREATE INDEX idx_user_companies_company ON user_companies(company_id);
CREATE INDEX idx_user_companies_active ON user_companies(is_active) WHERE is_active = true;

-- Remove company_id and role from users table (they're now in junction table)
ALTER TABLE users 
DROP COLUMN IF EXISTS company_id,
DROP COLUMN IF EXISTS role;

-- Add account_id to users if not exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE;