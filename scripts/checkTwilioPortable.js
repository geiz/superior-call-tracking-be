// portability-check.js
const twilio = require('twilio');
require('dotenv').config(); // Make sure to install dotenv: npm install dotenv

// Configuration
const config = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  phoneNumber: '+16473704276' // The number you want to check
};

// Enhanced portability check with multiple approaches
async function checkPortability() {
  console.log('🔍 Checking number portability for:', config.phoneNumber);
  console.log('📊 Using Twilio Account SID:', config.accountSid ? `${config.accountSid.substring(0, 10)}...` : 'NOT SET');
  
  // Validate credentials
  if (!config.accountSid || !config.authToken) {
    console.error('❌ Error: Missing Twilio credentials!');
    console.log('Please ensure these environment variables are set:');
    console.log('  - TWILIO_ACCOUNT_SID');
    console.log('  - TWILIO_AUTH_TOKEN');
    return;
  }

  try {
    // Initialize Twilio client
    const client = twilio(config.accountSid, config.authToken);

    // Method 1: Try the portability API
    console.log('\n📡 Method 1: Checking portability API...');
    try {
      const portability = await client.numbers.v1
        .portingPortabilities(config.phoneNumber)
        .fetch();

      console.log('✅ Portability Check Results:');
      console.log('  📞 Phone Number:', portability.phoneNumber);
      console.log('  ✅ Portable:', portability.portable);
      console.log('  📌 PIN Required:', portability.pinAndAccountNumberRequired);
      console.log('  🚫 Not Portable Reason:', portability.notPortableReason || 'N/A');
      console.log('  📦 Number Type:', portability.numberType);
      console.log('  🌍 Country:', portability.country);
      console.log('  📊 Raw response:', JSON.stringify(portability, null, 2));
    } catch (portError) {
      console.error('❌ Portability API Error:', portError.message);
      if (portError.code) {
        console.error('  Error Code:', portError.code);
      }
      if (portError.moreInfo) {
        console.error('  More Info:', portError.moreInfo);
      }
    }

    // Method 2: Check if number is available for purchase
    console.log('\n📡 Method 2: Checking availability for purchase...');
    try {
      // Extract area code from the phone number
      const areaCode = config.phoneNumber.substring(2, 5); // Assumes +1 prefix
      
      const availableNumbers = await client.availablePhoneNumbers('CA')
        .local
        .list({
          areaCode: parseInt(areaCode),
          contains: config.phoneNumber.substring(5), // Last 7 digits
          limit: 5
        });

      const exactMatch = availableNumbers.find(num => num.phoneNumber === config.phoneNumber);
      
      if (exactMatch) {
        console.log('✅ Number is available for purchase!');
        console.log('  📞 Phone Number:', exactMatch.phoneNumber);
        console.log('  📍 Location:', `${exactMatch.locality}, ${exactMatch.region}`);
        console.log('  💰 Capabilities:', {
          voice: exactMatch.capabilities.voice,
          SMS: exactMatch.capabilities.SMS,
          MMS: exactMatch.capabilities.MMS
        });
      } else {
        console.log('❌ Number is not available for direct purchase');
        console.log(`  Found ${availableNumbers.length} similar numbers in area code ${areaCode}`);
      }
    } catch (availError) {
      console.error('❌ Availability Check Error:', availError.message);
    }

    // Method 3: Look up current number information
    console.log('\n📡 Method 3: Looking up number information...');
    try {
      const lookup = await client.lookups.v2
        .phoneNumbers(config.phoneNumber)
        .fetch();

      console.log('✅ Number Lookup Results:');
      console.log('  📞 Phone Number:', lookup.phoneNumber);
      console.log('  🌍 Country Code:', lookup.countryCode);
      console.log('  📍 National Format:', lookup.nationalFormat);
      console.log('  ✅ Valid:', lookup.valid);
    } catch (lookupError) {
      console.error('❌ Lookup Error:', lookupError.message);
    }

  } catch (error) {
    console.error('\n❌ General Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Provide helpful troubleshooting tips
    console.log('\n🔧 Troubleshooting Tips:');
    console.log('1. Verify your Twilio credentials are correct');
    console.log('2. Ensure your account has the necessary permissions');
    console.log('3. Check if the Portability API is available in your region');
    console.log('4. The number format should be E.164 (e.g., +16473704276)');
    console.log('5. Your Twilio account may need to be upgraded to access certain APIs');
  }
}

// Alternative: Direct API call using fetch (Node.js 18+ or with node-fetch)
async function checkPortabilityDirect() {
  console.log('\n📡 Alternative Method: Direct API Call...');
  
  const fetch = require('node-fetch'); // npm install node-fetch@2
  
  const url = `https://numbers.twilio.com/v1/PortingPortabilities/${encodeURIComponent(config.phoneNumber)}`;
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ API Error:', response.status, error);
      return;
    }

    const data = await response.json();
    console.log('✅ Direct API Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Direct API Error:', error.message);
  }
}

// Run all checks
async function runAllChecks() {
  await checkPortability();
  
  // Uncomment to also try direct API call
  // await checkPortabilityDirect();
}

// Execute
runAllChecks().catch(console.error);