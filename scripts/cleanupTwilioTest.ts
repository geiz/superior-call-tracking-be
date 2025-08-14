// backend/src/scripts/setupTwilioTest.ts
// Load environment configuration first
import '../src/config/env';
import { validateEnv } from '../src/config/env';

// Validate required environment variables
validateEnv(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'DB_HOST', 'DB_USER', 'DB_PASSWORD']);

import { sequelize } from '../src/models';
import { TrackingNumber, Company, Call, CallRecording, SipEvent } from '../src/models';
import TwilioService from '../src/services/TwilioService';

async function cleanupTestNumber(sid?: string): Promise<void> {
  try {
    console.log('🧹 Starting Twilio test cleanup...\n');

    await sequelize.authenticate();

    if (sid) {
      // Clean up specific number
      console.log(`Looking for tracking number with SID: ${sid}`);
      
      const trackingNumber = await TrackingNumber.findOne({
        where: { provider_sid: sid }
      });

      if (trackingNumber) {
        await cleanupTrackingNumber(trackingNumber);
      } else {
        console.log('❌ Tracking number not found in database');
        console.log('🔍 Attempting to release from Twilio anyway...');
        try {
          await TwilioService.releaseNumber(sid);
          console.log('✅ Released from Twilio');
        } catch (error) {
          console.log('❌ Failed to release from Twilio:', error);
        }
      }
    } else {
      // Clean up all test numbers
      console.log('Cleaning up all test tracking numbers...');
      
      const testNumbers = await TrackingNumber.findAll({
        where: {
          source: 'test',
          campaign: 'sip-test'
        }
      });

      console.log(`Found ${testNumbers.length} test numbers to clean up`);

      for (const trackingNumber of testNumbers) {
        await cleanupTrackingNumber(trackingNumber);
      }
    }

    console.log('\n✅ Cleanup completed!');
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

async function cleanupTrackingNumber(trackingNumber: TrackingNumber): Promise<void> {
  console.log(`\n📞 Cleaning up ${trackingNumber.phone_number}...`);

  // Get call statistics before deletion
  const callCount = await Call.count({
    where: { tracking_number_id: trackingNumber.id }
  });

  const recordingCount = await CallRecording.count({
    include: [{
      model: Call,
      where: { tracking_number_id: trackingNumber.id }
    }]
  });

  const eventCount = await SipEvent.count({
    include: [{
      model: Call,
      where: { tracking_number_id: trackingNumber.id }
    }]
  });

  console.log(`   - Calls: ${callCount}`);
  console.log(`   - Recordings: ${recordingCount}`);
  console.log(`   - SIP Events: ${eventCount}`);

  // Delete from database (cascades to related records)
  await trackingNumber.destroy();
  console.log('   ✅ Removed from database');

  // Release from Twilio
  if (trackingNumber.provider_sid) {
    try {
      await TwilioService.releaseNumber(trackingNumber.provider_sid);
      console.log('   ✅ Released from Twilio');
    } catch (error) {
      console.log('   ❌ Failed to release from Twilio:', error);
    }
  }
}

// Run the cleanup
if (require.main === module) {
  const sid = process.argv[2];
  cleanupTestNumber(sid)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { cleanupTestNumber };