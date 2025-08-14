import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function checkSchema() {
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

    // Check current schema
    const currentSchema = await client.query('SHOW search_path');
    console.log('\n📊 Current search_path:', currentSchema.rows[0].search_path);

    // Get all schemas
    const schemas = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schema_name
    `);
    
    console.log('\n📊 Available schemas:');
    schemas.rows.forEach((row: any) => {
      console.log(`   - ${row.schema_name}`);
    });

    // Check tables in all schemas
    const tablesWithSchema = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_name IN ('companies', 'users', 'calls', 'tracking_numbers')
      ORDER BY table_schema, table_name
    `);

    console.log('\n📊 Critical tables location:');
    tablesWithSchema.rows.forEach((row: any) => {
      console.log(`   - ${row.table_schema}.${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

checkSchema();