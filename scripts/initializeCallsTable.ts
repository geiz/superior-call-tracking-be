import dotenv from 'dotenv';
import path from 'path';
import { QueryTypes } from 'sequelize';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { sequelize } from '../src/models';

async function initializeCallsTable() {
  try {
    console.log('🔧 Initializing Calls Table...');
    
    // Check if calls table exists
    const tableExists = await sequelize.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'calls'
      )`,
      { type: QueryTypes.SELECT }
    ) as any[];

    if (!tableExists[0].exists) {
      console.log('Creating calls table...');
      
      // Create the calls table with minimal structure
      await sequelize.query(`
        CREATE TABLE calls (
          id SERIAL PRIMARY KEY,
          uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
          call_sid VARCHAR(100) NOT NULL UNIQUE,
          company_id INTEGER NOT NULL,
          tracking_number_id INTEGER,
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
          direction VARCHAR(50) DEFAULT 'inbound',
          status VARCHAR(50) NOT NULL,
          disposition VARCHAR(50),
          hangup_cause VARCHAR(100),
          agent_id INTEGER,
          agent_session_id INTEGER,
          queue_time INTEGER DEFAULT 0,
          voicemail_url VARCHAR(500),
          is_spam BOOLEAN DEFAULT false,
          spam_score DECIMAL(3, 2),
          lead_status VARCHAR(50),
          lead_score INTEGER,
          has_value BOOLEAN DEFAULT false,
          value DECIMAL(10, 2),
          is_first_call BOOLEAN DEFAULT false,
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
          recording_enabled BOOLEAN DEFAULT true,
          transcription_enabled BOOLEAN DEFAULT false,
          notes TEXT,
          custom_fields JSONB DEFAULT '{}',
          tags JSONB DEFAULT '[]',
          sip_call_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        );
      `);
      
      // Create indexes
      await sequelize.query('CREATE INDEX idx_calls_company_id ON calls(company_id);');
      await sequelize.query('CREATE INDEX idx_calls_start_time ON calls(start_time);');
      await sequelize.query('CREATE INDEX idx_calls_caller_number ON calls(caller_number);');
      await sequelize.query('CREATE INDEX idx_calls_status ON calls(status);');
      
      console.log('✅ Calls table created successfully');
    } else {
      console.log('✅ Calls table already exists');
      
      // Check if it has any data
      const callCount = await sequelize.query(
        'SELECT COUNT(*) as count FROM calls',
        { type: QueryTypes.SELECT }
      ) as any[];
      
      console.log(`   Found ${callCount[0].count} calls in database`);
    }

    // Create some test data if none exists
    const hasData = await sequelize.query(
      'SELECT EXISTS(SELECT 1 FROM calls LIMIT 1)',
      { type: QueryTypes.SELECT }
    ) as any[];

    if (!hasData[0].exists) {
      console.log('Adding sample call data...');
      
      // Get a company ID
      const companies = await sequelize.query(
        'SELECT id FROM companies LIMIT 1',
        { type: QueryTypes.SELECT }
      ) as any[];
      
      if (companies.length > 0) {
        const companyId = companies[0].id;
        
        // Insert sample calls
        const sampleCalls = [
          {
            call_sid: `DEMO_${Date.now()}_1`,
            company_id: companyId,
            caller_number: '+14155551234',
            caller_name: 'John Doe',
            caller_city: 'San Francisco',
            caller_state: 'CA',
            caller_country: 'US',
            destination_number: '+14155559876',
            start_time: new Date(Date.now() - 3600000), // 1 hour ago
            end_time: new Date(Date.now() - 3300000), // 55 minutes ago
            duration: 300,
            talk_time: 280,
            status: 'completed',
            direction: 'inbound',
            source: 'google',
            campaign: 'Summer Sale',
            is_first_call: true
          },
          {
            call_sid: `DEMO_${Date.now()}_2`,
            company_id: companyId,
            caller_number: '+14155552345',
            caller_name: 'Jane Smith',
            caller_city: 'Los Angeles',
            caller_state: 'CA',
            caller_country: 'US',
            destination_number: '+14155559876',
            start_time: new Date(Date.now() - 7200000), // 2 hours ago
            end_time: new Date(Date.now() - 6900000),
            duration: 180,
            talk_time: 170,
            status: 'completed',
            direction: 'inbound',
            source: 'facebook',
            campaign: 'Brand Awareness'
          },
          {
            call_sid: `DEMO_${Date.now()}_3`,
            company_id: companyId,
            caller_number: '+14155553456',
            destination_number: '+14155559876',
            start_time: new Date(Date.now() - 1800000), // 30 minutes ago
            status: 'missed',
            direction: 'inbound',
            source: 'direct'
          }
        ];

        for (const call of sampleCalls) {
          await sequelize.query(
            `INSERT INTO calls (
              call_sid, company_id, caller_number, caller_name, 
              caller_city, caller_state, caller_country,
              destination_number, start_time, end_time, duration, 
              talk_time, status, direction, source, campaign, is_first_call
            ) VALUES (
              :call_sid, :company_id, :caller_number, :caller_name,
              :caller_city, :caller_state, :caller_country,
              :destination_number, :start_time, :end_time, :duration,
              :talk_time, :status, :direction, :source, :campaign, :is_first_call
            )`,
            {
              replacements: call,
              type: QueryTypes.INSERT
            }
          );
        }
        
        console.log('✅ Added 3 sample calls');
      } else {
        console.log('⚠️  No company found to create sample calls');
      }
    }

    console.log('\n✅ Calls table initialization complete');
    
  } catch (error) {
    console.error('❌ Error initializing calls table:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run the initialization
initializeCallsTable();