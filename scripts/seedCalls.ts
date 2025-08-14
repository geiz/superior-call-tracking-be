import dotenv from 'dotenv';
import { Sequelize } from 'sequelize-typescript';
import path from 'path';

// Load environment variables first
dotenv.config();

// Import models after env is loaded
import Company from '../src/models/Company';
import User from '../src/models/User';
import TrackingNumber from '../src/models/TrackingNumber';
import Call from '../src/models/Call';
import Tag from '../src/models/Tag';
import CallTag from '../src/models/CallTag';
import AgentSession from '../src/models/AgentSession';
import CallRecording from '../src/models/CallRecording';
import TextConversation from '../src/models/TextConversation';
import TextMessage from '../src/models/TextMessage';
import CustomerProfile from '../src/models/CustomerProfile';
import Visitor from '../src/models/Visitor';
import PageView from '../src/models/PageView';
import FormSubmission from '../src/models/FormSubmission';
import Webhook from '../src/models/Webhook';
import WebhookDelivery from '../src/models/WebhookDelivery';
import SipEvent from '../src/models/SipEvent';

import { CallStatus, CallDirection, CallDisposition } from '../src/types/enums';

// Initialize Sequelize with proper configuration
const sequelize = new Sequelize({
  database: process.env.DB_NAME || 'crc_db',
  dialect: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '25060'),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false,
  models: [
    Company, User, TrackingNumber, Call, Tag, CallTag, 
    AgentSession, CallRecording, TextConversation, TextMessage, 
    CustomerProfile, Visitor, PageView, FormSubmission, 
    Webhook, WebhookDelivery, SipEvent
  ]
});

// Sample phone numbers from different areas
const PHONE_NUMBERS = [
  '+14165551234', '+16475552345', '+19055553456', '+12895554567',
  '+14165555678', '+16475556789', '+19055557890', '+12895558901',
  '+14165559012', '+16475550123', '+19055551234', '+12895552345'
];

// Sample names
const FIRST_NAMES = ['John', 'Jane', 'Bob', 'Alice', 'Michael', 'Sarah', 'David', 'Emma', 'James', 'Lisa'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

// Sample cities in Ontario
const CITIES = [
  { city: 'Toronto', state: 'ON' },
  { city: 'Mississauga', state: 'ON' },
  { city: 'Hamilton', state: 'ON' },
  { city: 'Brampton', state: 'ON' },
  { city: 'Ottawa', state: 'ON' },
  { city: 'London', state: 'ON' },
  { city: 'Kitchener', state: 'ON' },
  { city: 'Windsor', state: 'ON' },
  { city: 'Niagara Falls', state: 'ON' }
];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedCalls() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Get company and tracking numbers
    const company = await Company.findOne();
    if (!company) {
      console.error('❌ No company found. Run npm run db:seed first.');
      process.exit(1);
    }

    let trackingNumbers = await TrackingNumber.findAll({
      where: { company_id: company.id, status: 'active' }
    });

    // Create tracking numbers if none exist
    if (trackingNumbers.length === 0) {
      console.log('📞 Creating tracking numbers...');
      
      const trackingData = [
        { phone: '+18885551111', name: 'Google Ads', source: 'google', medium: 'cpc' },
        { phone: '+18885552222', name: 'Facebook Ads', source: 'facebook', medium: 'social' },
        { phone: '+18885553333', name: 'Main Website', source: 'direct', medium: 'organic' },
        { phone: '+18885554444', name: 'Email Campaign', source: 'email', medium: 'email' }
      ];

      for (const data of trackingData) {
        await TrackingNumber.create({
          company_id: company.id,
          phone_number: data.phone,
          friendly_name: data.name,
          source: data.source,
          medium: data.medium,
          campaign: 'q1-2024',
          type: 'toll-free',
          sms_enabled: true,
          status: 'active',
          call_flow: {
            record_calls: true,
            timeout_seconds: 30,
            voicemail_enabled: true,
            voicemail_greeting: "Please leave a message after the beep.",
            voicemail_transcribe: true
          }
        } as any);
      }

      trackingNumbers = await TrackingNumber.findAll({
        where: { company_id: company.id }
      });
    }

    // Get tags
    const tags = await Tag.findAll({ where: { company_id: company.id } });
    console.log(`Found ${tags.length} tags`);

    console.log(`📊 Seeding calls for ${trackingNumbers.length} tracking numbers...`);

    // Generate calls for the last 90 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    let totalCalls = 0;
    const numCalls = 500; // Fixed number for now

    for (let i = 0; i < numCalls; i++) {
      // Random date/time within range
      const callDate = new Date(
        startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime())
      );
      
      // Random tracking number
      const trackingNumber = getRandomElement(trackingNumbers);
      
      // Random caller
      const callerNumber = getRandomElement(PHONE_NUMBERS);
      const firstName = getRandomElement(FIRST_NAMES);
      const lastName = getRandomElement(LAST_NAMES);
      const location = getRandomElement(CITIES);
      
      // Call duration and status
      const isAnswered = Math.random() > 0.2; // 80% answer rate
      let status: CallStatus;
      let duration = 0;
      let talkTime = 0;
      let disposition: CallDisposition | undefined;

      if (isAnswered) {
        status = CallStatus.COMPLETED;
        disposition = CallDisposition.ANSWERED;
        duration = getRandomNumber(30, 600); // 30 sec to 10 min
        talkTime = duration - getRandomNumber(5, 15); // Ring time
      } else {
        const missedReason = Math.random();
        if (missedReason < 0.4) {
          status = CallStatus.NO_ANSWER;
          disposition = CallDisposition.MISSED;
          duration = getRandomNumber(15, 30);
        } else if (missedReason < 0.7) {
          status = CallStatus.VOICEMAIL;
          disposition = CallDisposition.VOICEMAIL;
          duration = getRandomNumber(30, 60);
        } else {
          status = CallStatus.BUSY;
          disposition = CallDisposition.ABANDONED;
          duration = getRandomNumber(5, 15);
        }
      }

      // Generate call_sid BEFORE creating the call
      const generatedCallSid = `CALL_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Create the call
      const call = await Call.create({
        call_sid: generatedCallSid,
        company_id: company.id,
        tracking_number_id: trackingNumber.id,
        
        // Caller info
        caller_number: callerNumber,
        caller_name: `${firstName} ${lastName}`,
        caller_city: location.city,
        caller_state: location.state,
        caller_country: 'CA',
        caller_zip: `${getRandomElement(['M', 'L', 'K', 'N'])}${getRandomNumber(1, 9)}${getRandomElement(['A', 'B', 'C', 'K', 'L', 'M'])} ${getRandomNumber(1, 9)}${getRandomElement(['A', 'B', 'C', 'K', 'L', 'M'])}${getRandomNumber(1, 9)}`,
        
        // Call details
        destination_number: trackingNumber.phone_number,
        direction: CallDirection.INBOUND,
        status,
        disposition,
        
        // Timing
        start_time: callDate,
        answer_time: isAnswered ? new Date(callDate.getTime() + 5000) : undefined,
        end_time: new Date(callDate.getTime() + (duration * 1000)),
        duration,
        talk_time: talkTime,
        ring_time: isAnswered ? 5 : duration,
        
        // Attribution
        source: trackingNumber.source,
        medium: trackingNumber.medium,
        campaign: trackingNumber.campaign || 'default',
        
        // Lead tracking
        is_first_call: Math.random() > 0.7,
        has_value: isAnswered && Math.random() > 0.7,
        value: isAnswered && Math.random() > 0.7 ? parseFloat((Math.random() * 5000).toFixed(2)) : undefined,
        
        // Recording (for answered calls) - use the generated call_sid
        recording_enabled: isAnswered,
        recording_url: isAnswered ? `https://demo-recordings.calltracking.com/${generatedCallSid}.mp3` : undefined,
        recording_duration: isAnswered ? duration : undefined,
        
        // Quality scores
        sentiment: isAnswered ? getRandomElement(['positive', 'neutral', 'negative']) : undefined,
        sentiment_score: isAnswered ? parseFloat((Math.random()).toFixed(2)) : undefined,
        
        // Metadata
        lead_score: getRandomNumber(0, 100),
        spam_score: parseFloat((Math.random() * 0.3).toFixed(2)),
        is_spam: false
      } as any);

      // Add tags randomly (30% chance)
      if (tags.length > 0 && Math.random() > 0.7) {
        const numTags = getRandomNumber(1, Math.min(3, tags.length));
        const selectedTagIndices = new Set<number>();
        
        while (selectedTagIndices.size < numTags) {
          selectedTagIndices.add(getRandomNumber(0, tags.length - 1));
        }
        
        for (const index of selectedTagIndices) {
          try {
            // Use raw query to avoid timestamp issues
            await sequelize.query(
              `INSERT INTO call_tags (call_id, tag_id, auto_applied, applied_at) 
               VALUES (:callId, :tagId, :autoApplied, NOW())`,
              {
                replacements: {
                  callId: call.id,
                  tagId: tags[index].id,
                  autoApplied: Math.random() > 0.7
                },
                type: 'INSERT' as any
              }
            );
          } catch (tagError) {
            console.log(`Warning: Could not add tag ${tags[index].id} to call ${call.id}`);
          }
        }
      }

      totalCalls++;
      
      if (totalCalls % 50 === 0) {
        console.log(`  Created ${totalCalls} calls...`);
      }
    }

    console.log(`✅ Successfully created ${totalCalls} calls`);

    // Show summary
    const summary = await sequelize.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count 
       FROM calls 
       WHERE company_id = :companyId 
       GROUP BY status`,
      {
        replacements: { companyId: company.id },
        type: 'SELECT' as any
      }
    );

    console.log('\n📊 Call Summary:');
    summary.forEach((row) => {
      console.log(`  ${row.status}: ${row.count} calls`);
    });

    // Show tag summary
    const tagSummary = await sequelize.query<{ tag_name: string; count: string }>(
      `SELECT t.name as tag_name, COUNT(*) as count 
       FROM call_tags ct
       JOIN tags t ON ct.tag_id = t.id
       JOIN calls c ON ct.call_id = c.id
       WHERE c.company_id = :companyId
       GROUP BY t.name
       ORDER BY count DESC`,
      {
        replacements: { companyId: company.id },
        type: 'SELECT' as any
      }
    );

    if (tagSummary.length > 0) {
      console.log('\n🏷️  Tag Summary:');
      tagSummary.forEach((row) => {
        console.log(`  ${row.tag_name}: ${row.count} calls`);
      });
    }

  } catch (error) {
    console.error('❌ Error seeding calls:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
    }
  } finally {
    await sequelize.close();
  }
}

// Run the seeder
seedCalls();