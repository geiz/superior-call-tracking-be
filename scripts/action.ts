// scripts/testEmails.ts
// Minimal direct-calls test runner for BrevoService
import { config } from 'dotenv';
config();

import crypto from 'crypto';
// Adjust the path below to match your repo layout
import BrevoService from '../src/services/BrevoService';

const genPassword = (len = 12) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  return Array.from(crypto.randomBytes(len)).map(b => chars[b % chars.length]).join('');
};

async function main() {
  const type = (process.argv[2] || 'reset').toLowerCase();

  // You can override these via envs like TEST_EMAIL, TEST_FIRST, etc.
  const email = process.env.TEST_EMAIL || 'ali@superiorplumbing.ca';
  const first = process.env.TEST_FIRST || 'Ali';
  const last = process.env.TEST_LAST || 'Aliyev';

  try {
    if (type === 'welcome') {
      const password = process.env.TEST_PASSWORD || genPassword();
      const res = await BrevoService.sendWelcomeEmail({
        to: email,
        firstName: first,
        lastName: last,
        email,
        password
      });
      console.log('✅ Welcome email sent', res);
    } else if (type === 'invite') {
      const company = process.env.TEST_COMPANY || 'Superior Call Tracking';
      const role = process.env.TEST_ROLE || 'agent';
      const inviter = process.env.TEST_INVITER || 'Admin User';
      const password = process.env.TEST_PASSWORD || genPassword();

      const res = await BrevoService.sendInvitationEmail({
        to: email,
        toName: `${first} ${last}`,
        companyName: company,
        role,
        email,
        password
      });
      console.log('✅ Invitation email sent', res);
    } else if (type === 'reset') {
      const tempPassword = process.env.TEST_TEMP_PASSWORD || genPassword();
      const res = await BrevoService.sendPasswordResetEmail({
        to: email,
        firstName: first,
        tempPassword
      });
      console.log('✅ Password reset email sent', res);
    } else {
      console.error('❌ Unknown type. Use: welcome | invite | reset');
      process.exit(1);
    }

    if (!BrevoService.isConfigured()) {
      console.warn('⚠️  BREVO_API_KEY not set — running in mock mode (no real email sent).');
    }
  } catch (err: any) {
    console.error('❌ Send failed:', err?.response?.data || err?.message || err);
    process.exit(1);
  }
}

main();
