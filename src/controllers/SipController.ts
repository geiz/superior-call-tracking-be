// backend/src/controllers/SipController.ts - Enhanced version with live streaming
import { Request, Response } from 'express';
import twilio from 'twilio';
import WebSocket from 'ws';
import { AuthRequest } from '../middleware/auth';
import {
  Call,
  TrackingNumber,
  Company,
  CallRecording,
  CustomerProfile,
  SipEvent,
  Visitor
} from '../models';
import {
  CallStatus,
  CallDirection,
  CallDisposition,
  WebhookEvent,
  LeadStatus
} from '../types/enums';
import TwilioService from '../services/TwilioService';
import WebhookService from '../services/WebhookService';
import CallerIdService from '../services/CallerIdService';
import RecordingService from '../services/RecordingService';
import { StorageService } from '../services/StorageService';
import SocketManager from '../socket/SocketManager';
import { generateCallSid } from '../utils/helpers';
import { Op } from 'sequelize';

// Twilio webhook request types
interface TwilioVoiceRequest {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: string;
  ApiVersion: string;
  Direction: string;
  ForwardedFrom?: string;
  CallerName?: string;
  CallerCity?: string;
  CallerState?: string;
  CallerZip?: string;
  CallerCountry?: string;
  FromCity?: string;
  FromState?: string;
  FromZip?: string;
  FromCountry?: string;
  ToCity?: string;
  ToState?: string;
  ToZip?: string;
  ToCountry?: string;
}

interface TwilioStatusCallbackRequest extends TwilioVoiceRequest {
  CallDuration?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
  RecordingDuration?: string;
  Timestamp?: string;
  CallbackSource?: string;
  SequenceNumber?: string;
}

interface TwilioRecordingCallbackRequest {
  RecordingSid: string;
  RecordingUrl: string;
  RecordingStatus: string;
  RecordingDuration: string;
  RecordingChannels: string;
  RecordingSource: string;
  CallSid: string;
  AccountSid: string;
}

interface TwilioDialCallbackRequest {
  CallSid: string;
  DialCallStatus: string;
  DialCallDuration?: string;
  DialCallSid?: string;
  DialBridged?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
}

interface TwilioFallbackRequest extends TwilioVoiceRequest {
  ErrorCode?: string;
  ErrorUrl?: string;
}

class SipController {
  private readonly SIP_ENDPOINT = process.env.SIP_ENDPOINT || '';
  private readonly SIP_USERNAME = process.env.SIP_USERNAME || '';
  private readonly SIP_PASSWORD = process.env.SIP_PASSWORD || '';
  private socketManager: SocketManager | null = null;

  constructor() {
    // Socket manager will be injected via middleware
  }

  setSocketManager(socketManager: SocketManager) {
    this.socketManager = socketManager;
  }

  /**
   * Handle incoming call webhook from Twilio
   */
  async handleIncomingCall(req: Request<{}, {}, TwilioVoiceRequest>, res: Response): Promise<void> {
    try {
      const {
        CallSid,
        From,
        To,
        CallerName,
        CallerCity,
        CallerState,
        CallerZip,
        CallerCountry
      } = req.body;

      console.log(`Incoming call: ${From} -> ${To} (${CallSid})`);

      // Find tracking number
      const trackingNumber = await TrackingNumber.findOne({
        where: { phone_number: To },
        include: [Company]
      });

      if (!trackingNumber || !trackingNumber.company) {
        console.error(`Tracking number not found: ${To}`);
        const twiml = this.generateErrorResponse('This number is not in service.');
        res.type('text/xml').send(twiml);
        return;
      }

      // NEW: Find visitor with this tracking number assigned
      let visitorId: string | undefined;
      let visitorRecord: Visitor | null = null;

      if (trackingNumber.is_pool_number) {
        // Look for a visitor who currently has this number assigned
        visitorRecord = await Visitor.findOne({
          where: {
            company_id: trackingNumber.company_id,
            assigned_number: To,
            assigned_at: {
              [Op.gte]: new Date(Date.now() - (trackingNumber.company.dni_session_duration || 1800) * 1000)
            }
          },
          order: [['assigned_at', 'DESC']]
        });

        if (visitorRecord) {
          visitorId = visitorRecord.visitor_id;
          console.log(`Found visitor ${visitorId} for tracking number ${To}`);
        } else {
          console.log(`No active visitor found for tracking number ${To}`);
        }
      }

      // Check if customer exists
      const [customer, created] = await CustomerProfile.findOrCreate({
        where: {
          company_id: trackingNumber.company_id,
          phone_number: From
        },
        defaults: {
          first_name: CallerName || 'Unknown',
          city: CallerCity,
          state: CallerState,
          country: CallerCountry,
          last_call_at: new Date(),
          total_calls: 1,
          // Link acquisition source from visitor if available
          acquisition_source: visitorRecord?.first_source || trackingNumber.source,
          acquisition_medium: visitorRecord?.first_medium || trackingNumber.medium,
          acquisition_campaign: visitorRecord?.first_campaign || trackingNumber.campaign

        } as any
      });

      // Check for first-time caller
      const isFirstCall = created || customer.total_calls === 0;

      // Create call record
      const call = await Call.create({
        call_sid: CallSid,
        company_id: trackingNumber.company_id,
        tracking_number_id: trackingNumber.id,
        caller_number: From,
        caller_name: CallerName,
        caller_city: CallerCity,
        caller_state: CallerState,
        caller_country: CallerCountry,
        caller_zip: CallerZip,
        destination_number: To,
        direction: CallDirection.INBOUND,
        status: CallStatus.RINGING,
        start_time: new Date(),
        is_first_call: isFirstCall,
        recording_enabled: true,
        source: visitorRecord?.first_source || trackingNumber.source,
        medium: visitorRecord?.first_medium || trackingNumber.medium,
        campaign: visitorRecord?.first_campaign || trackingNumber.campaign,
        visitor_id: visitorId, // Link the visitor
        landing_page: visitorRecord?.first_landing_page,
        gclid: visitorRecord?.gclid,
        fbclid: visitorRecord?.fbclid,
        msclkid: visitorRecord?.msclkid,
        metadata: {
          customer_id: customer.id,
          twilio_data: req.body,
          caller_location: {
            city: CallerCity,
            state: CallerState,
            zip: CallerZip,
            country: CallerCountry
          },
          visitor_session: visitorId ? {
            visitor_id: visitorId,
            assigned_at: visitorRecord?.assigned_at,
            page_views: visitorRecord?.page_views,
            first_visit: visitorRecord?.first_visit_at
          } : null
        }
      } as any);

      // Update visitor if found
      if (visitorRecord) {
        await visitorRecord.update({
          phone_number: From, // Store the caller's number
          email: customer.email // Link email if available
        });
      }

      // Update customer if existing
      if (!customer.isNewRecord) {
        await customer.update({
          last_call_at: new Date(),
          total_calls: customer.total_calls + 1
        });
      }

      // Create SIP event
      await SipEvent.create({
        company_id: trackingNumber.company_id,
        call_id: call.id,
        event_type: 'incoming_call',
        event_timestamp: new Date(),
        event_data: req.body,
        sip_call_id: CallSid,
        from_uri: From,
        to_uri: To
      } as any);

      // Emit real-time notification
      if (this.socketManager) {
        this.socketManager.emitToCompany(
          trackingNumber.company_id,
          'call:incoming',
          {
            callId: call.id,
            callSid: CallSid,
            from: From,
            to: To,
            trackingNumber: trackingNumber.friendly_name,
            isFirstCall: isFirstCall,
            timestamp: new Date()
          }
        );
      }

      // Trigger webhook for call started
      await WebhookService.triggerWebhooks(
        trackingNumber.company_id,
        WebhookEvent.CALL_STARTED,
        call.uuid,
        {
          call_id: call.uuid,
          call_sid: CallSid,
          from: From,
          to: To,
          tracking_number: trackingNumber.friendly_name,
          source: trackingNumber.source,
          campaign: trackingNumber.campaign,
          is_first_call: call.is_first_call
        }
      );

      // Enrich caller info in background
      CallerIdService.enrichCall(call.id).catch(console.error);

      // Generate TwiML response to forward to SIP with recording and streaming
      const twiml = this.generateSipForwardResponse(trackingNumber, call);

      res.type('text/xml');
      res.send(twiml);
    } catch (error) {
      console.error('Error handling incoming call:', error);
      const twiml = this.generateErrorResponse();
      res.type('text/xml').send(twiml);
    }
  }

  /**
   * Generate TwiML to forward call to SIP with recording and live streaming
   */
  private generateSipForwardResponse(trackingNumber: TrackingNumber, call: Call): string {
    const twiml = new twilio.twiml.VoiceResponse();

    // Start media stream for live listening if WebSocket is available
    if (process.env.ENABLE_LIVE_STREAMING === 'true') {
      const stream = twiml.start();
      stream.stream({
        url: `wss://${process.env.BASE_DOMAIN}/api/sip/stream/${call.call_sid}`,
        name: `stream_${call.call_sid}`,
        track: 'both_tracks'
      });
    }

    // Configure dial with recording
    const dial = twiml.dial({
      timeout: trackingNumber.call_flow?.timeout_seconds || 30,
      action: `${process.env.BASE_URL}/api/sip/dial-status`,
      method: 'POST',
      callerId: call.caller_number,
      record: 'record-from-answer-dual', // Records both channels
      recordingStatusCallback: `${process.env.BASE_URL}/api/sip/recording-status`,
      recordingStatusCallbackMethod: 'POST',
      recordingStatusCallbackEvent: ['completed', 'in-progress']
    });

    // Add SIP endpoint
    if (this.SIP_USERNAME && this.SIP_PASSWORD) {
      dial.sip({
        username: this.SIP_USERNAME,
        password: this.SIP_PASSWORD
      }, `sip:${this.SIP_ENDPOINT}`);
    } else {
      dial.sip(`sip:${this.SIP_ENDPOINT}`);
    }

    console.log('Generated TwiML for SIP routing:', twiml.toString());
    return twiml.toString();
  }

  /**
   * Handle Twilio Media Stream WebSocket connection for live call audio
   */
  async handleMediaStream(ws: WebSocket, req: Request): Promise<void> {
    const callSid = req.params.callSid;
    console.log(`Media stream connected for call: ${callSid}`);

    // Find the call
    const call = await Call.findOne({ where: { call_sid: callSid } });
    if (!call) {
      console.error(`Call not found for stream: ${callSid}`);
      ws.close();
      return;
    }

    ws.on('message', async (message: string) => {
      try {
        const msg = JSON.parse(message);

        switch (msg.event) {
          case 'connected':
            console.log('Media stream connected:', msg.streamSid);
            // Notify clients that streaming has started
            this.emitCallStreamStart(call);
            break;

          case 'start':
            console.log('Media stream started:', {
              streamSid: msg.streamSid,
              callSid: msg.start.callSid,
              tracks: msg.start.tracks,
              customParameters: msg.start.customParameters
            });
            break;

          case 'media':
            // Forward audio payload to connected clients
            if (msg.media?.payload) {
              this.forwardAudioStream(callSid, msg.media.payload, msg.media.track);
            }
            break;

          case 'stop':
            console.log('Media stream stopped');
            this.emitCallStreamEnd(callSid);
            break;

          default:
            console.log('Unknown stream event:', msg.event);
        }
      } catch (error) {
        console.error('Error handling media stream:', error);
      }
    });

    ws.on('close', () => {
      console.log(`Media stream disconnected for call: ${callSid}`);
      this.emitCallStreamEnd(callSid);
    });

    ws.on('error', (error) => {
      console.error(`Media stream error for call ${callSid}:`, error);
    });
  }

  private emitCallStreamStart(call: Call): void {
    if (!this.socketManager) return;

    this.socketManager.emitToCompany(
      call.company_id,
      'call:stream:start',
      {
        callId: call.id,
        callSid: call.call_sid,
        timestamp: new Date()
      }
    );
  }

  private forwardAudioStream(callSid: string, audioPayload: string, track: string): void {
    if (!this.socketManager) return;

    // Emit to all users listening to this specific call
    this.socketManager.emitToCall(
      callSid,
      'call:stream:audio',
      {
        callSid,
        audio: audioPayload,
        track,
        timestamp: new Date()
      }
    );
  }

  private emitCallStreamEnd(callSid: string): void {
    if (!this.socketManager) return;

    this.socketManager.emitToCall(
      callSid,
      'call:stream:end',
      {
        callSid,
        timestamp: new Date()
      }
    );
  }

  /**
   * Handle dial status callback
   */
  async handleDialStatus(req: Request<{}, {}, any>, res: Response): Promise<void> {
    try {
      const { CallSid, DialCallStatus, DialCallDuration, DialCallSid } = req.body;

      console.log(`Dial status: ${CallSid} -> ${DialCallStatus}`);

      const call = await Call.findOne({ where: { call_sid: CallSid } });
      if (!call) {
        res.sendStatus(200);
        return;
      }

      // Update call status based on dial result
      if (DialCallStatus === 'answered') {
        await call.update({
          status: CallStatus.IN_PROGRESS,
          answer_time: new Date()
        });

        // Emit status update
        if (this.socketManager) {
          this.socketManager.emitToCompany(
            call.company_id,
            'call:answered',
            {
              callId: call.id,
              callSid: CallSid,
              timestamp: new Date()
            }
          );
        }
      }

      // Handle voicemail if call wasn't answered and voicemail is enabled
      const trackingNumber = await TrackingNumber.findByPk(call.tracking_number_id);

      if (trackingNumber &&
        trackingNumber.call_flow?.voicemail_enabled &&
        (DialCallStatus === 'no_answer' || DialCallStatus === 'busy')) {

        const twiml = new twilio.twiml.VoiceResponse();

        // Play voicemail greeting
        twiml.say({
          voice: 'alice'
        }, trackingNumber.call_flow.voicemail_greeting || 'Please leave a message after the beep.');

        // Record voicemail
        twiml.record({
          maxLength: 120, // 2 minutes max for voicemail
          playBeep: true,
          transcribe: trackingNumber.call_flow.voicemail_transcribe || false,
          transcribeCallback: `${process.env.BASE_URL}/api/sip/voicemail-transcription`,
          recordingStatusCallback: `${process.env.BASE_URL}/api/sip/voicemail-recording`,
          recordingStatusCallbackMethod: 'POST'
        });

        res.type('text/xml').send(twiml.toString());
      } else {
        // Call completed or failed
        res.sendStatus(200);
      }
    } catch (error) {
      console.error('Error handling dial status:', error);
      res.sendStatus(200);
    }
  }

  /**
   * Handle call status updates from Twilio
   */
  async handleCallStatus(req: Request<{}, {}, TwilioStatusCallbackRequest>, res: Response): Promise<void> {
    try {
      const {
        CallSid,
        CallStatus: TwilioStatus,
        CallDuration,
        RecordingUrl,
        RecordingSid,
        RecordingDuration
      } = req.body;

      console.log(`Call status update: ${CallSid} - ${TwilioStatus}`);

      const call = await Call.findOne({ where: { call_sid: CallSid } });
      if (!call) {
        console.error(`Call not found for status update: ${CallSid}`);
        res.sendStatus(200);
        return;
      }

      // Map Twilio status to our status
      let newStatus: CallStatus = call.status;
      let disposition: CallDisposition | undefined;

      switch (TwilioStatus) {
        case 'ringing':
          newStatus = CallStatus.RINGING;
          break;
        case 'in-progress':
          newStatus = CallStatus.IN_PROGRESS;
          break;
        case 'completed':
          newStatus = CallStatus.COMPLETED;
          break;
        case 'busy':
          newStatus = CallStatus.BUSY;
          break;
        case 'no_answer':
          newStatus = CallStatus.NO_ANSWER;
          break;
        case 'failed':
          newStatus = CallStatus.FAILED;
          break;
        case 'canceled':
          newStatus = CallStatus.CANCELED;
          break;
      }

      // Calculate call duration and times
      const endTime = new Date();
      const duration = CallDuration ? parseInt(CallDuration) : 0;
      const talkTime = call.answer_time ?
        Math.floor((endTime.getTime() - call.answer_time.getTime()) / 1000) : 0;

      // Update call record
      await call.update({
        status: newStatus,
        disposition,
        end_time: newStatus === CallStatus.COMPLETED || newStatus === CallStatus.FAILED ? endTime : undefined,
        duration,
        talk_time: talkTime,
        metadata: {
          ...call.metadata,
          twilio_final_status: TwilioStatus,
          recording_url: RecordingUrl,
          recording_sid: RecordingSid,
          recording_duration: RecordingDuration
        }
      });

      // Emit real-time status update
      if (this.socketManager) {
        this.socketManager.emitToCompany(
          call.company_id,
          'call:status:updated',
          {
            callId: call.id,
            callSid: CallSid,
            status: newStatus,
            disposition,
            duration,
            timestamp: new Date()
          }
        );
      }

      // Trigger webhook
      await WebhookService.triggerWebhooks(
        call.company_id,
        newStatus === CallStatus.COMPLETED ? WebhookEvent.CALL_COMPLETED : WebhookEvent.CALL_STARTED,
        call.uuid,
        {
          call_id: call.uuid,
          call_sid: CallSid,
          status: newStatus,
          duration: call.duration,
          disposition: call.disposition
        }
      );

      res.sendStatus(200);
    } catch (error) {
      console.error('Error handling call status:', error);
      res.sendStatus(200);
    }
  }

  /**
   * Enhanced recording status handler with real-time notifications
   */
  async handleRecordingStatus(req: Request<{}, {}, TwilioRecordingCallbackRequest>, res: Response): Promise<void> {
    try {
      const {
        RecordingSid,
        RecordingUrl,
        RecordingStatus,
        RecordingDuration,
        CallSid
      } = req.body;

      console.log(`Recording status: ${RecordingSid} - ${RecordingStatus}`);

      if (RecordingStatus === 'failed') {
        console.error(`Recording failed for call: ${CallSid}`);
        res.sendStatus(200);
        return;
      }

      if (RecordingStatus !== 'completed') {
        res.sendStatus(200);
        return;
      }

      // Find the call
      const call = await Call.findOne({
        where: { call_sid: CallSid },
        include: [Company]
      });

      if (!call) {
        console.error(`Call not found for recording: ${CallSid}`);
        res.sendStatus(200);
        return;
      }

      // Process the recording
      const recording = await RecordingService.processCallRecording(
        call.id,
        RecordingSid,
        RecordingUrl,
        parseInt(RecordingDuration)
      );

      // Emit real-time update
      if (this.socketManager) {
        this.socketManager.emitToCompany(
          call.company_id,
          'call:recording:ready',
          {
            callId: call.id,
            callSid: CallSid,
            recordingId: recording.id,
            recordingUrl: recording.file_url,
            duration: recording.duration,
            timestamp: new Date()
          }
        );
      }

      // Trigger webhook
      await WebhookService.triggerWebhooks(
        call.company_id,
        WebhookEvent.RECORDING_COMPLETED,
        call.uuid,
        {
          call_id: call.uuid,
          call_sid: CallSid,
          recording_id: recording.id,
          recording_url: recording.file_url,
          duration: recording.duration
        }
      );

      console.log(`Recording processed for call ${CallSid}`);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error handling recording status:', error);
      res.sendStatus(200);
    }
  }
  /**
   * Handle fallback webhook
   */
  async handleFallback(req: Request<{}, {}, TwilioFallbackRequest>, res: Response): Promise<void> {
    try {
      const { CallSid, ErrorCode, ErrorUrl } = req.body;

      console.error(`Call fallback: ${CallSid}`, {
        errorCode: ErrorCode,
        errorUrl: ErrorUrl
      });

      // Log the error
      const call = await Call.findOne({ where: { call_sid: CallSid } });
      if (call) {
        await call.update({
          status: CallStatus.FAILED,
          metadata: {
            ...call.metadata,
            error_code: ErrorCode,
            error_url: ErrorUrl,
            failed_at: new Date()
          }
        });

        // Emit error notification
        if (this.socketManager) {
          this.socketManager.emitToCompany(
            call.company_id,
            'call:error',
            {
              callId: call.id,
              callSid: CallSid,
              errorCode: ErrorCode,
              timestamp: new Date()
            }
          );
        }
      }

      // Return a simple error message
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({
        voice: 'alice'
      }, 'We apologize for the inconvenience. Please try again later.');
      twiml.hangup();

      res.type('text/xml').send(twiml.toString());
    } catch (error) {
      console.error('Error in fallback handler:', error);
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());
    }
  }

  /**
   * Make an outbound call
   */
  async makeOutboundCall(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { to, from, caller_id } = req.body;

      if (!to || !from) {
        res.status(400).json({ error: 'To and From numbers are required' });
        return;
      }

      // Find tracking number
      const trackingNumber = await TrackingNumber.findOne({
        where: {
          phone_number: from,
          company_id: req.user!.company_id
        }
      });

      if (!trackingNumber) {
        res.status(400).json({ error: 'Invalid from number' });
        return;
      }

      // Create call through Twilio
      const twilioCall = await TwilioService.getClient().calls.create({
        url: `${process.env.BASE_URL}/api/sip/outbound-handler`,
        to,
        from: from,
        callerId: caller_id || from,
        record: true,
        recordingStatusCallback: `${process.env.BASE_URL}/api/sip/recording-status`,
        recordingStatusCallbackMethod: 'POST',
        statusCallback: `${process.env.BASE_URL}/api/sip/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });

      // Create call record in database
      const call = await Call.create({
        //uuid: generateCallSid(),
        call_sid: twilioCall.sid,
        company_id: req.user!.company_id,
        tracking_number_id: trackingNumber.id,
        caller_number: from,
        destination_number: to,
        direction: CallDirection.OUTBOUND,
        status: CallStatus.RINGING,
        start_time: new Date(),
        agent_id: req.user!.id,
        recording_enabled: true,
        metadata: {
          initiated_by: req.user!.id,
          caller_id: caller_id || from
        }
      } as any);

      // Emit real-time notification
      if (this.socketManager) {
        this.socketManager.emitToCompany(
          req.user!.company_id,
          'call:outbound:initiated',
          {
            callId: call.id,
            callSid: twilioCall.sid,
            from,
            to,
            agentId: req.user!.id,
            timestamp: new Date()
          }
        );
      }

      res.json({
        call_id: call.id,
        call_sid: twilioCall.sid,
        status: 'initiated'
      });
    } catch (error) {
      console.error('Error making outbound call:', error);
      res.status(500).json({ error: 'Failed to initiate call' });
    }
  }

  /**
   * Handle outbound call TwiML generation
   */
  async handleOutboundCall(req: Request<{}, {}, TwilioVoiceRequest>, res: Response): Promise<void> {
    try {
      const twiml = new twilio.twiml.VoiceResponse();

      // Start media stream for outbound calls too
      if (process.env.ENABLE_LIVE_STREAMING === 'true') {
        const stream = twiml.start();
        stream.stream({
          url: `wss://${process.env.BASE_DOMAIN}/api/sip/stream/${req.body.CallSid}`,
          name: `stream_${req.body.CallSid}`,
          track: 'both_tracks'
        });
      }

      // Dial the SIP endpoint with recording
      const dial = twiml.dial({
        callerId: req.body.From,
        record: 'record-from-answer-dual',
        recordingStatusCallback: `${process.env.BASE_URL}/api/sip/recording-status`,
        recordingStatusCallbackMethod: 'POST'
      });

      dial.sip(this.SIP_ENDPOINT);

      res.type('text/xml').send(twiml.toString());
    } catch (error) {
      console.error('Error handling outbound call:', error);
      const twiml = this.generateErrorResponse();
      res.type('text/xml').send(twiml);
    }
  }

  /**
   * Generate error TwiML response
   */
  private generateErrorResponse(message: string = 'We apologize for the inconvenience. Please try your call again.'): string {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'alice' }, message);
    twiml.hangup();
    return twiml.toString();
  }
}

export default new SipController();