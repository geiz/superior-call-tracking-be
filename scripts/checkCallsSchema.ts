import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function checkCallsSchema() {
  console.log('🔍 Checking calls table schema...\n');
  
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
    console.log('✅ Connected to database\n');

    // Check if calls table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'calls'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log('❌ Calls table does not exist!');
      return;
    }

    console.log('📊 Calls table schema:\n');

    // Get column information
    const columns = await client.query(`
      SELECT 
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'calls'
      ORDER BY ordinal_position;
    `);

    console.log('Columns:');
    console.log('--------');
    columns.rows.forEach(col => {
      console.log(`${col.column_name.padEnd(30)} | ${col.data_type.padEnd(20)} | ${col.udt_name.padEnd(20)} | ${col.is_nullable}`);
    });

    // Check specifically for status and direction columns
    console.log('\n🔍 Checking for status and direction columns:\n');
    
    const statusCol = columns.rows.find(col => col.column_name === 'status');
    const directionCol = columns.rows.find(col => col.column_name === 'direction');
    
    if (statusCol) {
      console.log(`✅ 'status' column exists: ${statusCol.data_type} (${statusCol.udt_name})`);
    } else {
      console.log(`❌ 'status' column NOT FOUND`);
    }
    
    if (directionCol) {
      console.log(`✅ 'direction' column exists: ${directionCol.data_type} (${directionCol.udt_name})`);
    } else {
      console.log(`❌ 'direction' column NOT FOUND`);
    }

    // Check existing indexes
    console.log('\n📊 Existing indexes on calls table:\n');
    
    const indexes = await client.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' 
      AND tablename = 'calls'
      ORDER BY indexname;
    `);

    indexes.rows.forEach(idx => {
      console.log(`${idx.indexname}:`);
      console.log(`  ${idx.indexdef}`);
      console.log();
    });

    // Try to create the indexes with more detail
    console.log('\n🔧 Attempting to create missing indexes with detailed error info:\n');

    const indexesToCreate = [
      {
        name: 'idx_calls_status',
        sql: 'CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)'
      },
      {
        name: 'idx_calls_direction', 
        sql: 'CREATE INDEX IF NOT EXISTS idx_calls_direction ON calls(direction)'
      }
    ];

    for (const index of indexesToCreate) {
      try {
        await client.query(index.sql);
        console.log(`✅ Created index: ${index.name}`);
      } catch (error: any) {
        console.log(`❌ Failed to create ${index.name}:`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Detail: ${error.detail || 'No additional details'}`);
        console.log(`   Hint: ${error.hint || 'No hints available'}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

checkCallsSchema();