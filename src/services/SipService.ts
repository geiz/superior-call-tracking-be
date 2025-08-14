import { Call, TrackingNumber, Company, SipEvent, CallRecording} from '../models';
import { CallStatus, CallDirection, WebhookEvent, CallDisposition} from '../types/enums';

import WebhookService from './WebhookService';
import axios from 'axios';
import { generateCallSid } from '../utils/helpers';

interface SipCallData {
  call_sid: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound';
  sip_call_id: string;
  timestamp: Date;
}

interface SipEventData {
  type: string;
  call_id: string;
  timestamp: string;
  data: Record<string, any>;
  from?: string;
  to?: string;
}

export class SipService {
  /**
   * Handle incoming call to tracking number
   */
  async handleIncomingCall(data: SipCallData): Promise<any> {
    try {
      // Find tracking number
      const trackingNumber = await TrackingNumber.findOne({
        where: { phone_number: data.to },
        include: [Company]
      });

      if (!trackingNumber || !trackingNumber.company) {
        throw new Error(`Tracking number ${data.to} not found`);
      }

      // Create call record
      const call = await Call.create({
        call_sid: data.call_sid,
        company_id: trackingNumber.company_id,
        tracking_number_id: trackingNumber.id,
        caller_number: data.from,
        destination_number: data.to,
        direction: CallDirection.INBOUND,
        status: CallStatus.RINGING,
        start_time: data.timestamp,
        sip_call_id: data.sip_call_id,
        source: trackingNumber.source,
        medium: trackingNumber.medium,
        campaign: trackingNumber.campaign,
        recording_enabled: trackingNumber.call_flow.record_calls
      } as any);

      // Check if this is a first-time caller
      const previousCalls = await Call.count({
        where: {
          company_id: trackingNumber.company_id,
          caller_number: data.from,
          id: { $ne: call.id }
        }
      });

      if (previousCalls === 0) {
        await call.update({ is_first_call: true });
      }

      // Trigger webhook
      await WebhookService.triggerWebhooks(
        trackingNumber.company_id,
        WebhookEvent.CALL_STARTED,
        call.uuid,
        {
          call_id: call.uuid,
          call_sid: call.call_sid,
          from: data.from,
          to: data.to,
          tracking_number: trackingNumber.friendly_name,
          source: trackingNumber.source,
          campaign: trackingNumber.campaign,
          is_first_call: call.is_first_call
        }
      );

      // Return SIP routing instructions
      return {
        action: 'route',
        sip_uri: trackingNumber.sip_uri,
        timeout: trackingNumber.call_flow.timeout_seconds,
        record: trackingNumber.call_flow.record_calls,
        whisper_text: trackingNumber.source ? `Call from ${trackingNumber.source}` : null,
        fallback: {
          action: trackingNumber.call_flow.voicemail_enabled ? 'voicemail' : 'hangup',
          greeting: trackingNumber.call_flow.voicemail_greeting,
          transcribe: trackingNumber.call_flow.voicemail_transcribe
        }
      };
    } catch (error) {
      console.error('Error handling incoming call:', error);
      throw error;
    }
  }

  /**
   * Handle SIP events from PBX
   */
  async handleSipEvent(event: SipEventData): Promise<void> {
    try {
      // Find call by SIP call ID
      const call = await Call.findOne({
        where: { sip_call_id: event.call_id }
      });

      if (!call) {
        console.warn(`Call not found for SIP ID: ${event.call_id}`);
        return;
      }

      // Store event
      await SipEvent.create({
        company_id: call.company_id,
        call_id: call.id,
        event_type: event.type,
        event_timestamp: new Date(event.timestamp),
        event_data: event.data,
        sip_call_id: event.call_id,
        from_uri: event.from,
        to_uri: event.to
      } as any);

      // Update call based on event
      switch (event.type) {
        case 'answer':
          await this.handleAnswerEvent(call, event);
          break;
        case 'hangup':
          await this.handleHangupEvent(call, event);
          break;
        case 'transfer':
          await this.handleTransferEvent(call, event);
          break;
        case 'recording_start':
          await this.handleRecordingStartEvent(call, event);
          break;
        case 'recording_stop':
          await this.handleRecordingStopEvent(call, event);
          break;
        case 'voicemail':
          await this.handleVoicemailEvent(call, event);
          break;
        case 'dtmf':
          await this.handleDtmfEvent(call, event);
          break;
      }
    } catch (error) {
      console.error('Error handling SIP event:', error);
      throw error;
    }
  }

  private async handleAnswerEvent(call: Call, event: SipEventData): Promise<void> {
    await call.update({
      status: CallStatus.IN_PROGRESS,
      answer_time: new Date(event.timestamp),
      forwarding_number: event.data.answered_by
    });

    await WebhookService.triggerWebhooks(
      call.company_id,
      WebhookEvent.CALL_ANSWERED,
      call.uuid,
      {
        call_id: call.uuid,
        call_sid: call.call_sid,
        answered_by: event.data.answered_by,
        answer_time: event.timestamp
      }
    );
  }

  private async handleHangupEvent(call: Call, event: SipEventData): Promise<void> {
    const endTime = new Date(event.timestamp);
    const duration = Math.floor((endTime.getTime() - call.start_time.getTime()) / 1000);
    const talkTime = call.answer_time 
      ? Math.floor((endTime.getTime() - call.answer_time.getTime()) / 1000)
      : 0;

    await call.update({
      status: CallStatus.COMPLETED,
      end_time: endTime,
      duration,
      talk_time: talkTime,
      hangup_cause: event.data.cause
    });

    // Update tracking number stats
    if (call.tracking_number_id) {
      await TrackingNumber.increment(
        { total_calls: 1, total_minutes: Math.ceil(duration / 60) },
        { where: { id: call.tracking_number_id } }
      );

      await TrackingNumber.update(
        { last_call_at: endTime },
        { where: { id: call.tracking_number_id } }
      );
    }

    await WebhookService.triggerWebhooks(
      call.company_id,
      WebhookEvent.CALL_COMPLETED,
      call.uuid,
      {
        call_id: call.uuid,
        call_sid: call.call_sid,
        duration,
        talk_time: talkTime,
        status: call.status,
        hangup_cause: event.data.cause
      }
    );
  }

  private async handleTransferEvent(call: Call, event: SipEventData): Promise<void> {
    await call.update({
      forwarding_number: event.data.transfer_to,
      metadata: {
        ...call.metadata,
        transfers: [
          ...(call.metadata.transfers || []),
          {
            from: event.data.transfer_from,
            to: event.data.transfer_to,
            timestamp: event.timestamp,
            type: event.data.transfer_type
          }
        ]
      }
    });
  }

  private async handleRecordingStartEvent(call: Call, event: SipEventData): Promise<void> {
    await call.update({
      recording_enabled: true,
      metadata: {
        ...call.metadata,
        recording_start: event.timestamp,
        recording_id: event.data.recording_id
      }
    });
  }

  private async handleRecordingStopEvent(call: Call, event: SipEventData): Promise<void> {
    await call.update({
      recording_url: event.data.recording_url,
      recording_duration: event.data.duration,
      metadata: {
        ...call.metadata,
        recording_stop: event.timestamp,
        recording_size: event.data.file_size
      }
    });

    // Create recording record
    if (event.data.recording_url) {
      await CallRecording.create({
        call_id: call.id,
        file_url: event.data.recording_url,
        duration: event.data.duration,
        file_size: event.data.file_size,
        format: event.data.format || 'mp3',
        storage_provider: 'remote'
      } as any);
    }
  }

  private async handleVoicemailEvent(call: Call, event: SipEventData): Promise<void> {
    await call.update({
      status: CallStatus.VOICEMAIL,
      disposition: CallDisposition.VOICEMAIL,
      metadata: {
        ...call.metadata,
        voicemail_url: event.data.voicemail_url,
        voicemail_duration: event.data.duration,
        voicemail_transcription: event.data.transcription
      }
    });

    await WebhookService.triggerWebhooks(
      call.company_id,
      WebhookEvent.VOICEMAIL_RECEIVED,
      call.uuid,
      {
        call_id: call.uuid,
        call_sid: call.call_sid,
        voicemail_url: event.data.voicemail_url,
        duration: event.data.duration,
        transcription: event.data.transcription
      }
    );
  }

  private async handleDtmfEvent(call: Call, event: SipEventData): Promise<void> {
    // Store DTMF digits in metadata
    await call.update({
      metadata: {
        ...call.metadata,
        dtmf_digits: (call.metadata.dtmf_digits || '') + event.data.digit
      }
    });
  }

  /**
   * Make outbound call through SIP
   */
  async makeOutboundCall(
    companyId: number,
    from: string,
    to: string,
    callerId?: string
  ): Promise<Call> {
    const company = await Company.findByPk(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    const callSid = generateCallSid();

    // Create call record
    const call = await Call.create({
      call_sid: callSid,
      company_id: companyId,
      caller_number: callerId || from,
      destination_number: to,
      direction: CallDirection.OUTBOUND,
      status: CallStatus.RINGING,
      start_time: new Date(),
      recording_enabled: company.recording_enabled
    } as any);

    // Send request to PBX to initiate call
    try {
      const response = await axios.post(
        `https://${company.sip_domain}/api/calls`,
        {
          from,
          to,
          caller_id: callerId,
          call_sid: callSid,
          record: company.recording_enabled,
          webhook_url: `${process.env.SIP_WEBHOOK_URL}/events`
        },
        {
          auth: {
            username: company.sip_username || '',
            password: company.sip_password || ''
          },
          timeout: 10000
        }
      );

      await call.update({
        sip_call_id: response.data.sip_call_id
      });

      return call;
    } catch (error) {
      await call.update({
        status: CallStatus.FAILED,
        end_time: new Date()
      });
      throw error;
    }
  }

  /**
   * Get call by SIP call ID
   */
  async getCallBySipId(sipCallId: string): Promise<Call | null> {
    return Call.findOne({
      where: { sip_call_id: sipCallId }
    });
  }
}

export default new SipService();