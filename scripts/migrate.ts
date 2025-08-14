import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';
import fs from 'fs/promises';
import path from 'path';

async function runMigration() {
  console.log('🔄 Starting database migration...');

  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '25060'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'crc_db',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // First, let's run the critical SQL statements in order
    console.log('\n📦 Creating extensions...');

    const extensions = [
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
      `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
      `CREATE EXTENSION IF NOT EXISTS "btree_gin"`,
      `CREATE EXTENSION IF NOT EXISTS "pg_trgm"`
    ];

    for (const ext of extensions) {
      try {
        await client.query(ext);
        console.log(`   ✅ ${ext}`);
      } catch (error: any) {
        console.log(`   ⏭️  ${error.message}`);
      }
    }

    // Create types
    console.log('\n📦 Creating types...');

    const types = [
      `CREATE TYPE user_role AS ENUM ('admin', 'manager', 'user', 'agent')`,
      `CREATE TYPE company_status AS ENUM ('active', 'inactive', 'suspended', 'cancelled', 'trial')`,
      `CREATE TYPE call_status AS ENUM ('ringing', 'in_progress', 'completed', 'failed', 'busy', 'no_answer', 'canceled', 'voicemail', 'missed')`,
      `CREATE TYPE call_direction AS ENUM ('inbound', 'outbound')`,
      `CREATE TYPE call_disposition AS ENUM ('new', 'answered', 'answered_ai', 'voicemail', 'abandoned', 'blocked', 'missed')`,
      `CREATE TYPE agent_status AS ENUM ('available', 'busy', 'away', 'offline', 'in_call')`,
      `CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'unqualified', 'lost', 'customer')`,
      `CREATE TYPE lifecycle_stage AS ENUM ('subscriber', 'lead', 'opportunity', 'customer', 'evangelist')`,
      `CREATE TYPE message_direction AS ENUM ('inbound', 'outbound')`,
      `CREATE TYPE message_status AS ENUM ('pending', 'sending', 'sent', 'delivered', 'failed', 'received', 'read')`,
      `CREATE TYPE conversation_status AS ENUM ('active', 'archived', 'spam')`,
      `CREATE TYPE webhook_status AS ENUM ('active', 'inactive', 'failed')`,
      `CREATE TYPE webhook_event AS ENUM ('call.started', 'call.completed', 'call.recorded', 'text.received', 'text.sent', 'lead.created', 'form.submitted')`,
      `CREATE TYPE delivery_status AS ENUM ('pending', 'in_progress', 'success', 'failed', 'retry')`
    ];

    for (const type of types) {
      try {
        await client.query(type);
        const typeName = type.match(/CREATE TYPE (\w+)/)?.[1];
        console.log(`   ✅ Created type: ${typeName}`);
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`   ⏭️  Type already exists`);
        } else {
          console.error(`   ❌ ${error.message}`);
        }
      }
    }

    // Create tables in order
    console.log('\n📦 Creating tables...');

    // Companies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        subdomain VARCHAR(100) UNIQUE,
        timezone VARCHAR(50) DEFAULT 'America/New_York',
        industry VARCHAR(100),
        website VARCHAR(255),
        sip_domain VARCHAR(255) NOT NULL,
        sip_username VARCHAR(100),
        sip_password VARCHAR(255),
        sip_transport VARCHAR(10) DEFAULT 'UDP',
        sip_port INTEGER DEFAULT 5060,
        default_timeout_seconds INTEGER DEFAULT 30,
        voicemail_enabled BOOLEAN DEFAULT true,
        voicemail_transcription BOOLEAN DEFAULT true,
        recording_enabled BOOLEAN DEFAULT true,
        recording_disclaimer BOOLEAN DEFAULT true,
        settings JSONB DEFAULT '{"caller_id_lookup": true, "spam_detection": true, "call_scoring": true}'::jsonb,
        plan_type VARCHAR(50) DEFAULT 'starter',
        billing_email VARCHAR(255),
        monthly_minutes_limit INTEGER DEFAULT 100000,
        monthly_texts_limit INTEGER DEFAULT 100000,
        status company_status DEFAULT 'active',
        trial_ends_at TIMESTAMP,
        suspended_at TIMESTAMP,
        dni_enabled BOOLEAN DEFAULT true,
        dni_session_duration INTEGER DEFAULT 1800,
        dni_assignment_strategy VARCHAR(50) DEFAULT 'least_used',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created companies table');

    // Add DNI columns to companies if table already exists
    const dniCompanyColumns = [
      { name: 'dni_enabled', sql: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS dni_enabled BOOLEAN DEFAULT false' },
      { name: 'dni_session_duration', sql: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS dni_session_duration INTEGER DEFAULT 1800' },
      { name: 'dni_assignment_strategy', sql: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS dni_assignment_strategy VARCHAR(50) DEFAULT \'least_used\'' }
    ];

    for (const column of dniCompanyColumns) {
      try {
        await client.query(column.sql);
        console.log(`   ✅ Added DNI column to companies: ${column.name}`);
      } catch (error: any) {
        console.log(`   ⏭️  Column ${column.name} already exists or error: ${error.message}`);
      }
    }

    await client.query(`
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
  )
`);
    console.log('   ✅ Created accounts table');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
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
        sip_username VARCHAR(100) UNIQUE,
        sip_password VARCHAR(255),
        sip_realm VARCHAR(255),
        preferences JSONB DEFAULT '{"notifications": {"email": true, "sms": false, "desktop": true}, "timezone": null}'::jsonb,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        last_activity TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created users table');

    const userColumns = [
      { name: 'account_id', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL' },
      { name: 'personal_note', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_note TEXT' },
      { name: 'created_by', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)' }
    ];

    for (const column of userColumns) {
      try {
        await client.query(column.sql);
        console.log(`   ✅ Added column to users: ${column.name}`);
      } catch (error: any) {
        console.log(`   ⏭️  Column ${column.name} already exists or error: ${error.message}`);
      }
    }

    // Add indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_companies_account_id ON companies(account_id)');
    console.log('   ✅ Added indexes for new columns');

    // Tags table
    await client.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(7) DEFAULT '#3B82F6',
      description TEXT,
      created_by INTEGER REFERENCES users(id),
      is_auto_tag BOOLEAN DEFAULT false,
      auto_tag_rules JSONB,
      is_deleted BOOLEAN DEFAULT false,
      deleted_at TIMESTAMP,
      deleted_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    console.log('   ✅ Created tags table');

    // Add unique constraint for active tags only
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_active_tag_name 
      ON tags(company_id, name) 
      WHERE is_deleted = false
    `);
    console.log('   ✅ Created unique constraint for active tags');

    // Tracking numbers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracking_numbers (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        phone_number VARCHAR(20) UNIQUE NOT NULL,
        friendly_name VARCHAR(255),
        description TEXT,
        type VARCHAR(50) DEFAULT 'local',
        country_code VARCHAR(2) DEFAULT 'CA',
        sip_uri VARCHAR(255),
        source VARCHAR(100) NOT NULL,
        medium VARCHAR(100),
        campaign VARCHAR(255),
        campaign_id VARCHAR(100),
        call_flow JSONB DEFAULT '{"record_calls": true, "timeout_seconds": 30, "voicemail_enabled": true, "voicemail_greeting": "Please leave a message after the beep.", "voicemail_transcribe": true}'::jsonb,
        provider VARCHAR(50),
        provider_sid VARCHAR(100),
        monthly_fee DECIMAL(10,2) DEFAULT 0,
        per_minute_rate DECIMAL(10,4) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        verified BOOLEAN DEFAULT false,
        verified_at TIMESTAMP,
        sms_enabled BOOLEAN DEFAULT false,
        sms_webhook_url VARCHAR(500),
        total_calls INTEGER DEFAULT 0,
        total_minutes INTEGER DEFAULT 0,
        last_call_at TIMESTAMP,
        
        is_pool_number BOOLEAN DEFAULT false,
        is_default BOOLEAN DEFAULT false,
        assigned_to_visitor_at TIMESTAMP,
        last_assigned_at TIMESTAMP,
        assignment_count INTEGER DEFAULT 0,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created tracking_numbers table');

    // Add DNI columns to tracking_numbers if table already exists
    const dniTrackingColumns = [
      { name: 'is_pool_number', sql: 'ALTER TABLE tracking_numbers ADD COLUMN IF NOT EXISTS is_pool_number BOOLEAN DEFAULT false' },
      { name: 'is_default', sql: 'ALTER TABLE tracking_numbers ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false' },
      { name: 'assigned_to_visitor_at', sql: 'ALTER TABLE tracking_numbers ADD COLUMN IF NOT EXISTS assigned_to_visitor_at TIMESTAMP' },
      { name: 'last_assigned_at', sql: 'ALTER TABLE tracking_numbers ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMP' },
      { name: 'assignment_count', sql: 'ALTER TABLE tracking_numbers ADD COLUMN IF NOT EXISTS assignment_count INTEGER DEFAULT 0' }
    ];

    for (const column of dniTrackingColumns) {
      try {
        await client.query(column.sql);
        console.log(`   ✅ Added DNI column to tracking_numbers: ${column.name}`);
      } catch (error: any) {
        console.log(`   ⏭️  Column ${column.name} already exists or error: ${error.message}`);
      }
    }

    try {
      await client.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL');
      console.log('   ✅ Added account_id column to companies');
    } catch (error: any) {
      console.log(`   ⏭️  Column account_id already exists or error: ${error.message}`);
    }

    // Force all tracking numbers to be pool numbers
    try {
      await client.query(`
        UPDATE tracking_numbers
        SET is_pool_number = true
      `);
      console.log('   ✅ Set is_pool_number = true for all tracking numbers');
    } catch (error: any) {
      console.log(`   ❌ Failed to update tracking_numbers: ${error.message}`);
    }

    // Agent sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        ip_address INET,
        user_agent TEXT,
        socket_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'available',
        is_online BOOLEAN DEFAULT true,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        current_call_id INTEGER,
        calls_handled INTEGER DEFAULT 0,
        avg_handle_time INTEGER DEFAULT 0,
        break_start TIMESTAMP,
        break_reason VARCHAR(100),
        total_break_time INTEGER DEFAULT 0,
        max_concurrent_calls INTEGER DEFAULT 1,
        current_concurrent_calls INTEGER DEFAULT 0,
        queue_priorities JSONB DEFAULT '[]'::jsonb,
        skills JSONB DEFAULT '[]'::jsonb,
        total_talk_time INTEGER DEFAULT 0,
        total_idle_time INTEGER DEFAULT 0,
        total_wrap_time INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);
    console.log('   ✅ Created agent_sessions table');

    try {
      await client.query(`
        ALTER TABLE agent_sessions 
        ADD COLUMN IF NOT EXISTS status agent_status DEFAULT 'available'
      `);
      console.log('   ✅ Added status column to agent_sessions');
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('   ⏭️  Status column already exists in agent_sessions');
      } else {
        console.error(`   ❌ Failed to add status column: ${error.message}`);
      }
    }
    const agentSessionTimestamps = [
      { name: 'created_at', sql: 'ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      { name: 'updated_at', sql: 'ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
    ];

    for (const column of agentSessionTimestamps) {
      try {
        await client.query(column.sql);
        console.log(`   ✅ Added ${column.name} to agent_sessions`);
      } catch (error: any) {
        console.log(`   ⏭️  Column ${column.name} already exists or error: ${error.message}`);
      }
    }

    // Calls table - first check if it exists
    const callsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'calls'
      );
    `);

    if (!callsTableExists.rows[0].exists) {
      // Create the table if it doesn't exist
      await client.query(`
        CREATE TABLE calls (
          id SERIAL PRIMARY KEY,
          uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
          call_sid VARCHAR(100) NOT NULL UNIQUE,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          tracking_number_id INTEGER REFERENCES tracking_numbers(id),
          caller_number VARCHAR(20) NOT NULL,
          caller_name VARCHAR(255),
          caller_city VARCHAR(100),
          caller_state VARCHAR(50),
          caller_country VARCHAR(50),
          caller_zip VARCHAR(20),
          latitude DECIMAL(10, 8),
          longitude DECIMAL(11, 8),
          destination_number VARCHAR(20),
          forwarding_number VARCHAR(20),
          start_time TIMESTAMP NOT NULL,
          answer_time TIMESTAMP,
          end_time TIMESTAMP,
          duration INTEGER DEFAULT 0,
          talk_time INTEGER DEFAULT 0,
          ring_time INTEGER DEFAULT 0,
          hold_time INTEGER DEFAULT 0,
          queue_time INTEGER DEFAULT 0,
          direction call_direction DEFAULT 'inbound',
          status call_status NOT NULL,
          disposition call_disposition,
          hangup_cause VARCHAR(100),
          agent_id INTEGER REFERENCES users(id),
          agent_session_id INTEGER REFERENCES agent_sessions(id),
          assigned_to INTEGER REFERENCES users(id),
          voicemail_url VARCHAR(500),
          is_spam BOOLEAN DEFAULT false,
          spam_score DECIMAL(3, 2),
          is_first_call BOOLEAN DEFAULT false,
          first_call_id INTEGER,
          lead_status lead_status,
          lead_score INTEGER,
          has_value BOOLEAN DEFAULT false,
          value DECIMAL(10, 2),
          revenue DECIMAL(10, 2),
          recording_enabled BOOLEAN DEFAULT true,
          recording_url VARCHAR(500),
          recording_key VARCHAR(500),
          recording_duration INTEGER,
          transcription_enabled BOOLEAN DEFAULT false,
          transcription_status VARCHAR(50),
          transcription TEXT,
          transcription_confidence DECIMAL(3, 2),
          sentiment VARCHAR(20),
          sentiment_score DECIMAL(3, 2),
          talk_to_listen_ratio DECIMAL(3, 2),
          keywords_detected TEXT[],
          call_quality_score INTEGER,
          audio_quality VARCHAR(50),
          sip_call_id VARCHAR(255),
          sip_from_uri VARCHAR(255),
          sip_to_uri VARCHAR(255),
          codec VARCHAR(50),
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
          notes TEXT,
          custom_fields JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          tags JSONB DEFAULT '[]',
          submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✅ Created calls table');
    } else {
      console.log('   ⏭️  Calls table already exists, checking for missing columns...');

      // Add missing columns if they don't exist
      const columnsToAdd = [
        { name: 'direction', sql: 'ALTER TABLE calls ADD COLUMN IF NOT EXISTS direction call_direction DEFAULT \'inbound\'' },
        { name: 'status', sql: 'ALTER TABLE calls ADD COLUMN IF NOT EXISTS status call_status DEFAULT \'completed\'' },
        { name: 'disposition', sql: 'ALTER TABLE calls ADD COLUMN IF NOT EXISTS disposition call_disposition' },
        { name: 'lead_status', sql: 'ALTER TABLE calls ADD COLUMN IF NOT EXISTS lead_status lead_status' },
        { name: 'gclid', sql: 'ALTER TABLE calls ADD COLUMN IF NOT EXISTS gclid VARCHAR(255)' },
        { name: 'fbclid', sql: 'ALTER TABLE calls ADD COLUMN IF NOT EXISTS fbclid VARCHAR(255)' },
        { name: 'msclkid', sql: 'ALTER TABLE calls ADD COLUMN IF NOT EXISTS msclkid VARCHAR(255)' },
        { name: 'visitor_id', sql: 'ALTER TABLE calls ADD COLUMN IF NOT EXISTS visitor_id UUID' },
        { name: 'recording_key', sql: 'ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_key VARCHAR(500)' }
      ];

      for (const column of columnsToAdd) {
        try {
          await client.query(column.sql);
          console.log(`   ✅ Added column: ${column.name}`);
        } catch (error: any) {
          if (error.message.includes('already exists')) {
            console.log(`   ⏭️  Column ${column.name} already exists`);
          } else {
            console.error(`   ❌ Failed to add column ${column.name}: ${error.message}`);
          }
        }
      }
    }

    // Check if constraint exists before adding
    const constraintCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'calls_first_call_id_fkey'
      )
    `);

    if (!constraintCheck.rows[0].exists) {
      await client.query(`
        ALTER TABLE calls ADD CONSTRAINT calls_first_call_id_fkey 
        FOREIGN KEY (first_call_id) REFERENCES calls(id)
      `);
      console.log('   ✅ Added calls_first_call_id_fkey constraint');
    } else {
      console.log('   ⏭️  calls_first_call_id_fkey constraint already exists');
    }

    // Check if agent_sessions constraint exists
    const agentConstraintCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'agent_sessions_current_call_id_fkey'
      )
    `);

    if (!agentConstraintCheck.rows[0].exists) {
      await client.query(`
        ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_current_call_id_fkey 
        FOREIGN KEY (current_call_id) REFERENCES calls(id)
      `);
      console.log('   ✅ Added agent_sessions_current_call_id_fkey constraint');
    } else {
      console.log('   ⏭️  agent_sessions_current_call_id_fkey constraint already exists');
    }

    // Call recordings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS call_recordings (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        recording_sid VARCHAR(100),
        file_path VARCHAR(500),
        file_url VARCHAR(500),
        file_size BIGINT,
        duration INTEGER,
        format VARCHAR(20) DEFAULT 'mp3',
        channels INTEGER DEFAULT 1,
        sample_rate INTEGER DEFAULT 16000,
        bit_rate INTEGER DEFAULT 128,
        waveform_data JSONB,
        transcription_text TEXT,
        transcription_job_id VARCHAR(100),
        storage_provider VARCHAR(50) DEFAULT 'local',
        storage_bucket VARCHAR(255),
        storage_key VARCHAR(500),
        encrypted BOOLEAN DEFAULT false,
        encryption_key VARCHAR(255),
        retention_days INTEGER DEFAULT 90,
        delete_after TIMESTAMP,
        archived BOOLEAN DEFAULT false,
        archived_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created call_recordings table');

    // Add missing columns to call_recordings if needed
    const recordingColumns = [
      { name: 'company_id', sql: 'ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE' },
      { name: 'recording_sid', sql: 'ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS recording_sid VARCHAR(100)' },
      { name: 'status', sql: 'ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'pending\'' },
      { name: 'metadata', sql: 'ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT \'{}\'::jsonb' }
    ];

    for (const column of recordingColumns) {
      try {
        await client.query(column.sql);
        console.log(`   ✅ Added column to call_recordings: ${column.name}`);
      } catch (error: any) {
        console.log(`   ⏭️  Column ${column.name} already exists or error: ${error.message}`);
      }
    }

    const recordingColumnsUpdate = [
      { name: 'file_path_nullable', sql: 'ALTER TABLE call_recordings ALTER COLUMN file_path DROP NOT NULL' }
    ];

    for (const column of recordingColumnsUpdate) {
      try {
        await client.query(column.sql);
        console.log(`   ✅ Made file_path nullable in call_recordings`);
      } catch (error: any) {
        console.log(`   ⏭️  file_path already nullable or error: ${error.message}`);
      }
    }

    // Call tags table
    await client.query(`
      CREATE TABLE IF NOT EXISTS call_tags (
        id SERIAL PRIMARY KEY,
        call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        applied_by INTEGER REFERENCES users(id),
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        auto_applied BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(call_id, tag_id)
      )
    `);
    console.log('   ✅ Created call_tags table');

    // Agent status history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_status_history (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES agent_sessions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status agent_status NOT NULL,
        reason VARCHAR(255),
        duration INTEGER,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP
      )
    `);
    console.log('   ✅ Created agent_status_history table');

    // SIP events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sip_events (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        call_id INTEGER REFERENCES calls(id),
        event_type VARCHAR(50) NOT NULL,
        event_timestamp TIMESTAMP NOT NULL,
        event_data JSONB NOT NULL,
        sip_call_id VARCHAR(100),
        from_uri VARCHAR(255),
        to_uri VARCHAR(255),
        processed BOOLEAN DEFAULT false,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created sip_events table');

    // Text conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS text_conversations (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        tracking_number_id INTEGER REFERENCES tracking_numbers(id),
        customer_number VARCHAR(20) NOT NULL,
        customer_name VARCHAR(255),
        status conversation_status DEFAULT 'active',
        unread_count INTEGER DEFAULT 0,
        assigned_agent_id INTEGER REFERENCES users(id),
        last_agent_id INTEGER REFERENCES users(id),
        source VARCHAR(100),
        first_message_at TIMESTAMP,
        last_message_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, tracking_number_id, customer_number)
      )
    `);
    console.log('   ✅ Created text_conversations table');

    // Text messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS text_messages (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        conversation_id INTEGER REFERENCES text_conversations(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        message_sid VARCHAR(100) UNIQUE,
        direction message_direction NOT NULL,
        from_number VARCHAR(20) NOT NULL,
        to_number VARCHAR(20) NOT NULL,
        body TEXT NOT NULL,
        media_urls TEXT[],
        media_count INTEGER DEFAULT 0,
        status message_status DEFAULT 'sent',
        error_code VARCHAR(50),
        error_message TEXT,
        agent_id INTEGER REFERENCES users(id),
        agent_session_id INTEGER REFERENCES agent_sessions(id),
        read_at TIMESTAMP,
        sentiment VARCHAR(20),
        contains_question BOOLEAN DEFAULT false,
        urgent BOOLEAN DEFAULT false,
        provider VARCHAR(50),
        provider_cost DECIMAL(10,4),
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created text_messages table');

    // Customer profiles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_profiles (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        phone_number VARCHAR(20),
        email VARCHAR(255),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        company VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(50),
        country VARCHAR(50),
        timezone VARCHAR(50),
        lead_score INTEGER DEFAULT 0,
        lead_status lead_status DEFAULT 'new',
        lifecycle_stage lifecycle_stage DEFAULT 'subscriber',
        first_contact_at TIMESTAMP,
        last_contact_at TIMESTAMP,
        total_calls INTEGER DEFAULT 0,
        total_minutes INTEGER DEFAULT 0,
        total_texts INTEGER DEFAULT 0,
        total_forms INTEGER DEFAULT 0,
        total_page_views INTEGER DEFAULT 0,
        lifetime_value DECIMAL(10,2) DEFAULT 0,
        total_revenue DECIMAL(10,2) DEFAULT 0,
        average_order_value DECIMAL(10,2) DEFAULT 0,
        acquisition_source VARCHAR(100),
        acquisition_medium VARCHAR(100),
        acquisition_campaign VARCHAR(255),
        acquisition_date DATE,
        custom_fields JSONB DEFAULT '{}'::jsonb,
        crm_id VARCHAR(100),
        last_call_at TIMESTAMP,
        external_ids JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, phone_number),
        UNIQUE(company_id, email)
      )
    `);
    console.log('   ✅ Created customer_profiles table');

    // Visitors table
    await client.query(`
      CREATE TABLE IF NOT EXISTS visitors (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        visitor_id VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20),
        email VARCHAR(255),
        merged_with_id INTEGER REFERENCES visitors(id),
        first_visit_at TIMESTAMP NOT NULL,
        tracking_number_id INTEGER REFERENCES tracking_numbers(id),
        first_source VARCHAR(100),
        first_medium VARCHAR(100),
        first_campaign VARCHAR(255),
        first_landing_page VARCHAR(500),
        first_referrer VARCHAR(500),
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

        assigned_number VARCHAR(20),
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        session_data JSONB DEFAULT '{}'::jsonb,

        gclid VARCHAR(255),
        fbclid VARCHAR(255),
        msclkid VARCHAR(255),
        first_term VARCHAR(255),
        first_content VARCHAR(255),

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, visitor_id)
      )
    `);
    console.log('   ✅ Created visitors table');

    // Add DNI columns to visitors if table already exists
    const dniVisitorColumns = [
      { name: 'assigned_number', sql: 'ALTER TABLE visitors ADD COLUMN IF NOT EXISTS assigned_number VARCHAR(20)' },
      { name: 'tracking_number_id', sql: 'ALTER TABLE visitors ADD COLUMN IF NOT EXISTS tracking_number_id INTEGER REFERENCES tracking_numbers(id)' },
      { name: 'assigned_at', sql: 'ALTER TABLE visitors ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      { name: 'session_data', sql: 'ALTER TABLE visitors ADD COLUMN IF NOT EXISTS session_data JSONB DEFAULT \'{}\'::jsonb' },
      { name: 'gclid', sql: 'ALTER TABLE visitors ADD COLUMN IF NOT EXISTS gclid VARCHAR(255)' },
      { name: 'fbclid', sql: 'ALTER TABLE visitors ADD COLUMN IF NOT EXISTS fbclid VARCHAR(255)' },
      { name: 'msclkid', sql: 'ALTER TABLE visitors ADD COLUMN IF NOT EXISTS msclkid VARCHAR(255)' },
      { name: 'first_term', sql: 'ALTER TABLE visitors ADD COLUMN IF NOT EXISTS first_term VARCHAR(255)' },
      { name: 'first_content', sql: 'ALTER TABLE visitors ADD COLUMN IF NOT EXISTS first_content VARCHAR(255)' },
      { name: 'first_referrer', sql: 'ALTER TABLE visitors ADD COLUMN IF NOT EXISTS first_referrer VARCHAR(500)' }
    ];

    for (const column of dniVisitorColumns) {
      try {
        await client.query(column.sql);
        console.log(`   ✅ Added DNI column to visitors: ${column.name}`);
      } catch (error: any) {
        console.log(`   ⏭️  Column ${column.name} already exists or error: ${error.message}`);
      }
    }


    // Page views table
    await client.query(`
      CREATE TABLE IF NOT EXISTS page_views (
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created page_views table');

    // Form submissions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS form_submissions (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
        visitor_id INTEGER REFERENCES visitors(id),
        form_id VARCHAR(100),
        form_name VARCHAR(255),
        page_url VARCHAR(500),
        fields JSONB NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(20),
        company VARCHAR(255),
        source VARCHAR(100),
        medium VARCHAR(100),
        campaign VARCHAR(255),
        gclid VARCHAR(255),
        fbclid VARCHAR(255),
        status VARCHAR(50) DEFAULT 'new',
        assigned_to INTEGER REFERENCES users(id),
        submitted_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created form_submissions table');


    // Visitor number history table for DNI tracking
    await client.query(`
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
      )
    `);
    console.log('   ✅ Created visitor_number_history table');


    // Webhooks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(500) NOT NULL,
        events TEXT[] NOT NULL,
        auth_type VARCHAR(50),
        auth_credentials TEXT,
        signing_secret VARCHAR(255),
        custom_headers JSONB DEFAULT '{}'::jsonb,
        status webhook_status DEFAULT 'active',
        retry_on_failure BOOLEAN DEFAULT true,
        max_retries INTEGER DEFAULT 3,
        retry_delay_seconds INTEGER DEFAULT 60,
        timeout_seconds INTEGER DEFAULT 30,
        rate_limit_per_minute INTEGER DEFAULT 60,
        last_triggered_at TIMESTAMP,
        last_status_code INTEGER,
        consecutive_failures INTEGER DEFAULT 0,
        total_deliveries INTEGER DEFAULT 0,
        successful_deliveries INTEGER DEFAULT 0,
        circuit_breaker_threshold INTEGER DEFAULT 5,
        circuit_breaker_reset_after INTEGER DEFAULT 300,
        circuit_opened_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created webhooks table');

    // Webhook deliveries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id SERIAL PRIMARY KEY,
        webhook_id INTEGER REFERENCES webhooks(id) ON DELETE CASCADE,
        delivery_id UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        event_id VARCHAR(100),
        payload JSONB NOT NULL,
        headers_sent JSONB,
        attempt_number INTEGER DEFAULT 1,
        status delivery_status DEFAULT 'pending',
        request_sent_at TIMESTAMP,
        request_method VARCHAR(10) DEFAULT 'POST',
        response_received_at TIMESTAMP,
        response_status_code INTEGER,
        response_headers JSONB,
        response_body TEXT,
        response_time_ms INTEGER,
        error_message TEXT,
        error_details JSONB,
        retry_after TIMESTAMP,
        retried_from_id INTEGER REFERENCES webhook_deliveries(id),
        ip_address INET,
        dns_lookup_ms INTEGER,
        tcp_connect_ms INTEGER,
        tls_handshake_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created webhook_deliveries table');

    // Create DNI-specific function to get available pool numbers
    await client.query(`
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
    `);
    console.log('   ✅ Created get_available_pool_numbers function');

    // Create cleanup function for DNI
    await client.query(`
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
    `);
    console.log('   ✅ Created cleanup_expired_dni_sessions function');

    // Create update function
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('   ✅ Created update_updated_at_column function');

    // Create triggers for updated_at
    console.log('\n📦 Creating triggers...');

    const tablesWithUpdatedAt = [
      'accounts',
      'companies', 'users', 'tags', 'tracking_numbers', 'calls',
      'call_recordings', 'text_conversations', 'customer_profiles',
      'visitors', 'page_views', 'form_submissions', 'webhooks',
      'webhook_deliveries', 'visitor_number_history', 'call_tags', 'agent_sessions'
    ];

    for (const table of tablesWithUpdatedAt) {
      try {
        await client.query(`
          CREATE TRIGGER update_${table}_updated_at 
          BEFORE UPDATE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);
        console.log(`   ✅ Created trigger for ${table}`);
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`   ⏭️  Trigger for ${table} already exists`);
        } else {
          console.error(`   ❌ Error creating trigger for ${table}: ${error.message}`);
        }
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_invitations (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        temp_password VARCHAR(255) NOT NULL,
        role user_role NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        user_id INTEGER REFERENCES users(id),
        invited_by INTEGER NOT NULL REFERENCES users(id),
        accepted_by INTEGER REFERENCES users(id),
        accepted_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
        phone VARCHAR(20),
        personal_note TEXT,
        email_sent BOOLEAN DEFAULT false,
        email_sent_at TIMESTAMP,
        email_send_attempts INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created user_invitations table');

    // Create indexes for user_invitations
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_invitations_company ON user_invitations(company_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON user_invitations(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_invitations_expires_at ON user_invitations(expires_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_invitations_user_id ON user_invitations(user_id)');
    console.log('   ✅ Created indexes for user_invitations');

    // Create indexes
    console.log('\n📦 Creating indexes...');

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_calls_company_id ON calls(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_calls_tracking_number_id ON calls(tracking_number_id)',
      'CREATE INDEX IF NOT EXISTS idx_calls_start_time ON calls(start_time)',
      'CREATE INDEX IF NOT EXISTS idx_calls_caller_number ON calls(caller_number)',
      'CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_call_tags_call_id ON call_tags(call_id)',
      'CREATE INDEX IF NOT EXISTS idx_call_tags_tag_id ON call_tags(tag_id)',
      'CREATE INDEX IF NOT EXISTS idx_calls_campaign ON calls(campaign)',
      'CREATE INDEX IF NOT EXISTS idx_calls_lead_status ON calls(lead_status)',
      'CREATE INDEX IF NOT EXISTS idx_calls_assigned_to ON calls(assigned_to)',
      'CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at)',

      // DNI-specific indexes
      'CREATE INDEX IF NOT EXISTS idx_tracking_numbers_pool ON tracking_numbers(company_id, is_pool_number, status) WHERE is_pool_number = true',
      'CREATE INDEX IF NOT EXISTS idx_tracking_numbers_assignment ON tracking_numbers(assigned_to_visitor_at) WHERE is_pool_number = true',
      'CREATE INDEX IF NOT EXISTS idx_tracking_numbers_source_campaign ON tracking_numbers(company_id, source, medium, campaign) WHERE is_pool_number = true',
      'CREATE INDEX IF NOT EXISTS idx_visitor_number_history_visitor ON visitor_number_history(visitor_id)',
      'CREATE INDEX IF NOT EXISTS idx_visitor_number_history_number ON visitor_number_history(tracking_number_id)',
      'CREATE INDEX IF NOT EXISTS idx_visitor_number_history_released ON visitor_number_history(released_at) WHERE released_at IS NULL',
      'CREATE INDEX IF NOT EXISTS idx_calls_gclid ON calls(gclid) WHERE gclid IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_calls_fbclid ON calls(fbclid) WHERE fbclid IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_calls_visitor_id ON calls(visitor_id) WHERE visitor_id IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_visitors_assigned_number ON visitors(assigned_number) WHERE assigned_number IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_visitors_tracking_number ON visitors(tracking_number_id)',

      // Other indexes
      'CREATE INDEX IF NOT EXISTS idx_agent_sessions_user ON agent_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status) WHERE is_online = true',
      'CREATE INDEX IF NOT EXISTS idx_texts_conversation ON text_messages(conversation_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_texts_company ON text_messages(company_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customer_profiles(phone_number)',
      'CREATE INDEX IF NOT EXISTS idx_customers_email ON customer_profiles(email)',
      'CREATE INDEX IF NOT EXISTS idx_customers_company ON customer_profiles(company_id, lead_status)',
      'CREATE INDEX IF NOT EXISTS idx_tracking_company ON tracking_numbers(company_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_tracking_source ON tracking_numbers(source, medium, campaign)',
      'CREATE INDEX IF NOT EXISTS idx_webhooks_company_active ON webhooks(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status)',
      'CREATE INDEX IF NOT EXISTS idx_form_submissions_company ON form_submissions(company_id, submitted_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_form_submissions_visitor ON form_submissions(visitor_id)',
      'CREATE INDEX IF NOT EXISTS idx_form_submissions_email ON form_submissions(email)',
      'CREATE INDEX IF NOT EXISTS idx_form_submissions_phone ON form_submissions(phone)',
      'CREATE INDEX IF NOT EXISTS idx_visitors_company ON visitors(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views(visitor_id)',
      'CREATE INDEX IF NOT EXISTS idx_tags_company_deleted ON tags(company_id, is_deleted)',

      // GIN indexes for JSONB columns
      'CREATE INDEX IF NOT EXISTS idx_calls_custom_fields_gin ON calls USING gin(custom_fields)',
      'CREATE INDEX IF NOT EXISTS idx_calls_metadata_gin ON calls USING gin(metadata)',
      'CREATE INDEX IF NOT EXISTS idx_form_submissions_fields_gin ON form_submissions USING gin(fields)',
      'CREATE INDEX IF NOT EXISTS idx_webhooks_events_gin ON webhooks USING gin(events)'
    ];

    for (const index of indexes) {
      try {
        await client.query(index);
        console.log(`   ✅ ${index}`);
      } catch (error: any) {
        console.log(`   ⏭️  ${error.message}`);
      }
    }

    console.log('\n✅ Migration completed successfully!');


    try {
      await client.query(`
        UPDATE companies
        SET dni_enabled = true
      `);
      console.log('   ✅ Set dni_enabled = true for all existing companies');
    } catch (error: any) {
      console.log(`   ❌ Failed to update dni_enabled for companies: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

runMigration();

// async function listCompanies() {
//   const client = new Client({
//     host: process.env.DB_HOST,
//     port: parseInt(process.env.DB_PORT || '25060'),
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME || 'crc_db',
//     ssl: {
//       rejectUnauthorized: false
//     }
//   });

//   try {
//     await client.connect();
//     const res = await client.query(`
//       SELECT id, name, subdomain, status, dni_enabled
//       FROM companies
//       ORDER BY id ASC
//     `);

//     console.log('\n🏢 Companies:');
//     res.rows.forEach((row) => {
//       console.log(` - [${row.id}] ${row.name} | Subdomain: ${row.subdomain || '-'} | Status: ${row.status} | DNI: ${row.dni_enabled}`);
//     });
//   } catch (error) {
//     console.error('❌ Failed to list companies:', error);
//   } finally {
//     await client.end();
//   }
// }

// listCompanies();