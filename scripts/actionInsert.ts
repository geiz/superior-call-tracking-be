// scripts/action.ts
// Quick Action script for whatever i need.
import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

type UserRow = { id: number; email: string };
type UCRow = { user_id: number; company_id: number; role: string; is_default: boolean; is_active: boolean };

function getArg(name: string, fallback?: string) {
  const pref = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  // boolean flags like --all
  if (process.argv.includes(`--${name}`)) return 'true';
  return fallback;
}

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '25060', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'crc_db',
    ssl: { rejectUnauthorized: false },
  });

  const emailArg = getArg('email', 'david.shi@superiorplumbing.ca');
  const allFlag = getArg('all') === 'true';
  const companyId = parseInt(getArg('companyId', process.env.DEMO_COMPANY_ID || '1')!, 10);
  const role: string = getArg('role') ?? 'admin';
  const isDefault = getArg('default', 'true') === 'true';
  const isActive = getArg('active', 'true') === 'true';

  console.log('➡️  Starting ensureUserCompany');
  console.log(`   companyId=${companyId}, role=${role}, default=${isDefault}, active=${isActive}`);
  if (allFlag) {
    console.log('   Mode: --all (apply to every user missing this relationship)');
  } else {
    console.log(`   Mode: single email -> ${emailArg}`);
  }

  try {
    await client.connect();
    console.log('✅ Connected to database');

    if (allFlag) {
      // All users that DON'T have a row for this company
      const missing = await client.query<UserRow>(
        `
        SELECT u.id, u.email
        FROM users u
        LEFT JOIN user_companies uc
          ON uc.user_id = u.id AND uc.company_id = $1
        WHERE uc.user_id IS NULL
        ORDER BY u.id ASC
        `,
        [companyId]
      );

      if (missing.rows.length === 0) {
        console.log('🎉 Everyone already has a relationship to the target company.');
        return;
      }

      console.log(`👥 Found ${missing.rows.length} user(s) missing the relationship. Inserting...`);
      for (const u of missing.rows) {
        await insertIfMissing(client, u.id, companyId, role, isDefault, isActive);
      }
      console.log('✅ Done.');
      return;
    }

    // Single email mode
    const userRes = await client.query<UserRow>(
      `SELECT id, email FROM users WHERE email = $1 LIMIT 1`,
      [emailArg]
    );
    if (userRes.rowCount === 0) {
      console.error(`❌ No user found with email: ${emailArg}`);
      return;
    }
    const userId = userRes.rows[0].id;

    // Check existing relationship (your exact SQL)
    const check = await client.query(
      `
      SELECT uc.*, c.name
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1 AND uc.company_id = $2
      `,
      [userId, companyId]
    );

    if (check.rowCount && check.rowCount > 0) {
      const row = check.rows[0];
      console.log(`ℹ️ Relationship already exists: user_id=${row.user_id}, company_id=${row.company_id}, company_name=${row.name}`);
      return;
    }

    // Insert missing relationship (your exact SQL, parameterized)
    await insertIfMissing(client, userId, companyId, role, isDefault, isActive);
    console.log('✅ Inserted missing relationship.');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.end();
  }
}

async function insertIfMissing(
  client: Client,
  userId: number,
  companyId: number,
  role: string,
  isDefault: boolean,
  isActive: boolean
) {
  // Optional: Keep a single default per user (uncomment if your business rule requires it)
  // if (isDefault) {
  //   await client.query(`UPDATE user_companies SET is_default = false WHERE user_id = $1`, [userId]);
  // }

  const insertSQL = `
    INSERT INTO user_companies (user_id, company_id, role, is_default, is_active, joined_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id, company_id) DO NOTHING
    RETURNING user_id, company_id, role, is_default, is_active
  `;

  const res = await client.query<UCRow>(insertSQL, [userId, companyId, role, isDefault, isActive]);
  if (res.rowCount && res.rowCount > 0) {
    const r = res.rows[0];
    console.log(
      `➕ Inserted: user_id=${r.user_id}, company_id=${r.company_id}, role=${r.role}, default=${r.is_default}, active=${r.is_active}`
    );
  } else {
    console.log(`ℹ️ Skipped insert (already existed due to constraint): user_id=${userId}, company_id=${companyId}`);
  }
}


main().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});
