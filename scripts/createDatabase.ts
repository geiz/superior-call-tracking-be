import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function createDatabase() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '25060'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'defaultdb', // Connect to default database first
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 60000,
    query_timeout: 30000
  });

  try {
    console.log('🔄 Connecting to Digital Ocean PostgreSQL...');
    await client.connect();
    console.log('✅ Connected to database server');
    
    // Check if database exists
    const res = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [process.env.DB_NAME]
    );

    if (res.rows.length === 0) {
      // Create database
      console.log(`📦 Creating database ${process.env.DB_NAME}...`);
      await client.query(`CREATE DATABASE ${process.env.DB_NAME}`);
      console.log(`✅ Database ${process.env.DB_NAME} created successfully`);
    } else {
      console.log(`ℹ️  Database ${process.env.DB_NAME} already exists`);
    }
  } catch (error: any) {
    console.error('❌ Error creating database:', error.message);
    if (error.code) console.error('Error code:', error.code);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDatabase();