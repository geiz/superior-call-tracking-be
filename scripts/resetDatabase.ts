import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function resetDatabase() {
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

    console.log('🗑️  Dropping all tables...');
    
    // Drop all tables in the correct order (reverse of creation)
    const dropStatements = [
      'DROP TABLE IF EXISTS webhook_deliveries CASCADE',
      'DROP TABLE IF EXISTS webhooks CASCADE',
      'DROP TABLE IF EXISTS form_submissions CASCADE',
      'DROP TABLE IF EXISTS page_views CASCADE',
      'DROP TABLE IF EXISTS visitors CASCADE',
      'DROP TABLE IF EXISTS customer_profiles CASCADE',
      'DROP TABLE IF EXISTS text_messages CASCADE',
      'DROP TABLE IF EXISTS text_conversations CASCADE',
      'DROP TABLE IF EXISTS sip_events CASCADE',
      'DROP TABLE IF EXISTS agent_status_history CASCADE',
      'DROP TABLE IF EXISTS call_tags CASCADE',
      'DROP TABLE IF EXISTS call_recordings CASCADE',
      'DROP TABLE IF EXISTS calls CASCADE',
      'DROP TABLE IF EXISTS agent_sessions CASCADE',
      'DROP TABLE IF EXISTS tracking_numbers CASCADE',
      'DROP TABLE IF EXISTS tags CASCADE',
      'DROP TABLE IF EXISTS users CASCADE',
      'DROP TABLE IF EXISTS companies CASCADE'
    ];

    for (const statement of dropStatements) {
      try {
        await client.query(statement);
        console.log(`   ✅ ${statement}`);
      } catch (error: any) {
        console.log(`   ⏭️  ${error.message}`);
      }
    }

    console.log('\n🗑️  Dropping all types...');
    
    // Drop all custom types
    const dropTypes = [
      'DROP TYPE IF EXISTS delivery_status CASCADE',
      'DROP TYPE IF EXISTS webhook_event CASCADE',
      'DROP TYPE IF EXISTS webhook_status CASCADE',
      'DROP TYPE IF EXISTS conversation_status CASCADE',
      'DROP TYPE IF EXISTS message_status CASCADE',
      'DROP TYPE IF EXISTS message_direction CASCADE',
      'DROP TYPE IF EXISTS lifecycle_stage CASCADE',
      'DROP TYPE IF EXISTS lead_status CASCADE',
      'DROP TYPE IF EXISTS agent_status CASCADE',
      'DROP TYPE IF EXISTS call_disposition CASCADE',
      'DROP TYPE IF EXISTS call_direction CASCADE',
      'DROP TYPE IF EXISTS call_status CASCADE',
      'DROP TYPE IF EXISTS company_status CASCADE',
      'DROP TYPE IF EXISTS user_role CASCADE'
    ];

    for (const statement of dropTypes) {
      try {
        await client.query(statement);
        console.log(`   ✅ ${statement}`);
      } catch (error: any) {
        console.log(`   ⏭️  ${error.message}`);
      }
    }

    console.log('\n✅ Database reset complete!');
    
  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

resetDatabase();