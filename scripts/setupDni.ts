// backend/scripts/setupDni.ts - Script to set up DNI for a company

import { sequelize, Company, TrackingNumber } from '../src/models';

async function setupDni() {
  try {
    console.log('🚀 Setting up DNI...\n');

    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Get or create test company
    const [company] = await Company.findOrCreate({
      where: { id: 1 },
      defaults: {
        name: 'Demo Company',
        subdomain: 'demo',
        sip_domain: 'demo.pbx.example.com',
        status: 'active',
        dni_enabled: true,
        dni_session_duration: 1800, // 30 minutes
        dni_assignment_strategy: 'least_used'
      }
    });

    // Enable DNI for the company
    await company.update({
      dni_enabled: true,
      dni_session_duration: 1800,
      dni_assignment_strategy: 'least_used'
    });

    console.log(`✅ DNI enabled for company: ${company.name}`);

    // Create pool numbers
    const poolNumbers = [
      {
        phone_number: '+14165551001',
        friendly_name: 'Pool - Generic',
        source: 'pool',
        is_pool_number: true
      },
      {
        phone_number: '+14165551002',
        friendly_name: 'Pool - Google Ads',
        source: 'google',
        medium: 'cpc',
        is_pool_number: true
      },
      {
        phone_number: '+14165551003',
        friendly_name: 'Pool - Facebook',
        source: 'facebook',
        medium: 'social',
        is_pool_number: true
      },
      {
        phone_number: '+14165551004',
        friendly_name: 'Pool - Email Campaign',
        source: 'email',
        medium: 'newsletter',
        campaign: 'summer-sale',
        is_pool_number: true
      },
      {
        phone_number: '+14165551005',
        friendly_name: 'Default Number',
        source: 'direct',
        is_pool_number: false,
        is_default: true
      }
    ];

    console.log('\n📞 Creating pool numbers...');

    for (const numberData of poolNumbers) {
      const [number, created] = await TrackingNumber.findOrCreate({
        where: { 
          phone_number: numberData.phone_number,
          company_id: company.id
        },
        defaults: {
          ...numberData,
          company_id: company.id,
          status: 'active',
          sip_uri: '14378861145@sip.ringostat.com',
          call_flow: {
            record_calls: true,
            timeout_seconds: 30,
            voicemail_enabled: true,
            voicemail_greeting: "Please leave a message after the beep.",
            voicemail_transcribe: true
          }
        }
      });

      if (created) {
        console.log(`   ✅ Created: ${number.phone_number} - ${number.friendly_name}`);
      } else {
        await number.update({
          is_pool_number: numberData.is_pool_number,
          is_default: numberData.is_default || false,
          source: numberData.source,
          medium: numberData.medium,
          campaign: numberData.campaign
        });
        console.log(`   ✅ Updated: ${number.phone_number} - ${number.friendly_name}`);
      }
    }

    console.log('\n✅ DNI setup complete!');
    console.log('\nYou can now test DNI by running:');
    console.log('  npm run test:dni');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up DNI:', error);
    process.exit(1);
  }
}

setupDni();