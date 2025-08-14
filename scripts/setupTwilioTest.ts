// backend/src/scripts/setupTwilioTest.ts
import '../src/config/env';
import { validateEnv } from '../src/config/env';

// Validate required environment variables
validateEnv(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'DB_HOST', 'DB_USER', 'DB_PASSWORD']);

import { sequelize } from '../src/models';
import { TrackingNumber, Company } from '../src/models';
import TwilioService from '../src/services/TwilioService';

interface SetupResult {
  trackingNumber: string;
  sid: string;
  friendlyName: string;
  testInstructions: string[];
}

async function setupTestNumber(): Promise<SetupResult> {
  try {
    console.log('🚀 Starting Twilio test setup...\n');

    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // Get the demo company (ID: 1)
    const company = await Company.findByPk(1);
    if (!company) {
      throw new Error('Demo company not found. Please run db:seed first.');
    }

    // Area codes to try in order (Ontario, Canada)
    const areaCodes = ['416', '647', '905', '519', '226', '705', '249', '683'];
    let availableNumber: any = null;
    let selectedAreaCode = '';

    console.log('🔍 Searching for available numbers...\n');

    // Search for available numbers
    for (const areaCode of areaCodes) {
      console.log(`Checking area code ${areaCode}...`);
      
      try {
        const numbers = await TwilioService.searchAvailableNumbers(areaCode);
        
        if (numbers.length > 0) {
          availableNumber = numbers[0];
          selectedAreaCode = areaCode;
          console.log(`✅ Found ${numbers.length} available numbers in ${areaCode}`);
          break;
        } else {
          console.log(`❌ No numbers available in ${areaCode}`);
        }
      } catch (error) {
        console.log(`❌ Error searching ${areaCode}: ${error}`);
      }
    }

    if (!availableNumber) {
      throw new Error('No available numbers found in any of the specified area codes');
    }

    console.log(`\n📞 Selected number: ${availableNumber.phoneNumber}`);
    console.log(`   Location: ${availableNumber.locality}, ${availableNumber.region}`);
    console.log(`   Capabilities: Voice=${availableNumber.capabilities.voice}, SMS=${availableNumber.capabilities.sms}`);

    // Provision the number
    console.log('\n💳 Purchasing number from Twilio...');
    const provisioned = await TwilioService.provisionNumber(
      availableNumber.phoneNumber,
      `Test Tracking - ${selectedAreaCode}`
    );
    console.log('✅ Number purchased successfully!');

    // Create tracking number in database
    console.log('\n💾 Creating tracking number in database...');
    const trackingNumber = await TrackingNumber.create({
      company_id: company.id,
      phone_number: provisioned.phoneNumber,
      friendly_name: provisioned.friendlyName,
      description: 'Test tracking number for SIP integration',
      source: 'test',
      medium: 'direct',
      campaign: 'sip-test',
      type: 'local',
      country_code: 'CA',
      sip_uri: '14378861145@sip.ringostat.com',
      provider: 'twilio',
      provider_sid: provisioned.sid,
      status: 'active',
      verified: true,
      verified_at: new Date(),
      sms_enabled: provisioned.capabilities.sms,
      call_flow: {
        record_calls: true,
        timeout_seconds: 30,
        voicemail_enabled: true,
        voicemail_greeting: "Thank you for calling our test line. Please leave a message after the beep.",
        voicemail_transcribe: true
      }
    } as any);
    console.log('✅ Tracking number created in database');

    // Update Twilio configuration with webhook URLs
    console.log('\n🔧 Configuring Twilio webhooks...');
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    
    await TwilioService.updateNumberConfiguration(provisioned.phoneNumber, {
      voiceUrl: `${baseUrl}/api/sip/incoming`,
      smsUrl: `${baseUrl}/api/texts/webhook/receive`,
      friendlyName: provisioned.friendlyName
    });
    console.log('✅ Webhooks configured');

    // Generate test instructions
    const instructions = [
      `\n🎉 SUCCESS! Your test number is ready: ${provisioned.phoneNumber}`,
      `\n📋 Test Instructions:`,
      `1. Make sure your backend is running with these environment variables:`,
      `   - TWILIO_ACCOUNT_SID=${process.env.TWILIO_ACCOUNT_SID}`,
      `   - TWILIO_AUTH_TOKEN=**** (hidden)`,
      `   - BASE_URL=${baseUrl}`,
      ``,
      `2. If testing locally, use ngrok to expose your local server:`,
      `   ngrok http 3001`,
      `   Then update BASE_URL with the ngrok URL and re-run this script`,
      ``,
      `3. Call ${provisioned.phoneNumber} from your phone`,
      ``,
      `4. Expected behavior:`,
      `   - You'll hear a whisper message: "Call from test"`,
      `   - Call will be forwarded to 14378861145@sip.ringostat.com`,
      `   - If no answer after 30 seconds, voicemail will activate`,
      `   - Call will be recorded and tracked in the database`,
      ``,
      `5. Monitor the backend console for:`,
      `   - "Incoming call: [your number] -> ${provisioned.phoneNumber}"`,
      `   - Call status updates`,
      `   - Recording completion`,
      ``,
      `6. Check the database:`,
      `   - calls table: New call record with your number`,
      `   - sip_events table: Event logs`,
      `   - call_recordings table: Recording info (after call ends)`,
      ``,
      `7. To clean up after testing:`,
      `   npm run test:cleanup ${provisioned.sid}`
    ];

    console.log(instructions.join('\n'));

    return {
      trackingNumber: provisioned.phoneNumber,
      sid: provisioned.sid,
      friendlyName: provisioned.friendlyName,
      testInstructions: instructions
    };
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run the setup
if (require.main === module) {
  setupTestNumber()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { setupTestNumber };