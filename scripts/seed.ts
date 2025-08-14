import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Starting database seed...');

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

    // Check if data already exists
    const existingCompany = await client.query(
      `SELECT id FROM companies WHERE subdomain = 'demo'`
    );

    let companyId: number;

    if (existingCompany.rows.length > 0) {
      console.log('ℹ️  Demo company already exists');
      companyId = existingCompany.rows[0].id;

      // Update admin user password
      const passwordHash = await bcrypt.hash('admin123', 10);
      const updateResult = await client.query(`
        UPDATE users 
        SET password_hash = $1, 
            first_name = $2, 
            last_name = $3,
            is_active = true
        WHERE email = $4 AND company_id = $5
        RETURNING id
      `, [passwordHash, 'Admin', 'User', 'admin@demo.com', companyId]);

      if (updateResult.rows.length > 0) {
        console.log('✅ Updated admin user password');
      } else {
        // Create admin user if doesn't exist
        const userResult = await client.query(`
          INSERT INTO users (company_id, email, password_hash, first_name, last_name, role, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          companyId,
          'admin@demo.com',
          passwordHash,
          'Admin',
          'User',
          'ADMIN',
          true
        ]);
        console.log('✅ Created admin user');
      }

    } else {
      // Create demo company
      const companyResult = await client.query(`
        INSERT INTO companies (name, subdomain, status, sip_domain, plan_type, trial_ends_at, settings)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        'Demo Company',
        'demo',
        'trial',
        process.env.SIP_ENDPOINT,
        'trial',
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        JSON.stringify({
          caller_id_lookup: true,
          spam_detection: true,
          call_scoring: true
        })
      ]);

      companyId = companyResult.rows[0].id;
      console.log('✅ Created demo company');

      // Create admin user
      const passwordHash = await bcrypt.hash('admin123', 10);
      const userResult = await client.query(`
        INSERT INTO users (company_id, email, password_hash, first_name, last_name, role)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        companyId,
        'admin@demo.com',
        passwordHash,
        'Admin',
        'User',
        'admin'
      ]);

      const userId = userResult.rows[0].id;
      console.log('✅ Created admin user');

      // Create default tags
      const tags = [
        { name: 'new', color: '#10B981', description: 'First time caller' },
        { name: 'customer', color: '#3B82F6', description: 'Existing customer' },
        { name: 'hot-lead', color: '#EF4444', description: 'High intent caller' },
        { name: 'support', color: '#6366F1', description: 'Support inquiry' },
        { name: 'spam', color: '#6B7280', description: 'Spam or unwanted call' }
      ];

      for (const tag of tags) {
        // Check if tag exists first
        const existingTag = await client.query(
          `SELECT id FROM tags WHERE company_id = $1 AND name = $2 AND is_deleted = false`,
          [companyId, tag.name]
        );

        if (existingTag.rows.length === 0) {
          await client.query(`
            INSERT INTO tags (company_id, name, color, description, created_by, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [companyId, tag.name, tag.color, tag.description, userId, false]);
        }
      }

      console.log('✅ Created default tags');

      // Create a sample tracking number
      await client.query(`
        INSERT INTO tracking_numbers (
          company_id, phone_number, friendly_name, source, 
          status, sms_enabled, call_flow
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (phone_number) DO NOTHING
      `, [
        companyId,
        '+14165551234',
        'Main Number',
        'website',
        'active',
        false,
        JSON.stringify({
          record_calls: true,
          timeout_seconds: 30,
          voicemail_enabled: true,
          voicemail_greeting: "Please leave a message after the beep.",
          voicemail_transcribe: true
        })
      ]);

      console.log('✅ Created sample tracking number');
    }

    console.log('\n🎉 Seed completed successfully!');
    console.log('📧 Login with: admin@demo.com / admin123');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

seed();