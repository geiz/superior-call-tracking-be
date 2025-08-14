import { Call, CallRecording, Company } from '../models';
import {StorageService} from './StorageService';
import TwilioService from './TwilioService';
import { StoragePaths } from '../utils/storagePaths';

const storage = new StorageService();
export class RecordingService {
  async processCallRecording(
    callId: number, 
    recordingSid: string, 
    recordingUrl: string,
    duration: number
  ): Promise<CallRecording> {
    try {
      const call = await Call.findByPk(callId, {
        include: [Company]
      });
      
      if (!call || !call.company) {
        throw new Error('Call not found');
      }

      // Check if recording already exists
      const existingRecording = await CallRecording.findOne({
        where: { call_id: callId, recording_sid: recordingSid }
      });

      if (existingRecording) {
        console.log('Recording already processed:', recordingSid);
        return existingRecording;
      }

      // Upload to Digital Ocean
      const { url: doUrl, key: doKey } = await storage.uploadRecordingFromTwilio(
        `${recordingUrl}.mp3`,
        call.call_sid,
        call.company_id,
      );

      // Create recording record
      const recording = await CallRecording.create({
        call_id: callId,
        company_id: call.company_id,
        recording_sid: recordingSid,
        file_url: doUrl,
        file_path: doKey,
        duration,
        format: 'mp3',
        channels: 2,
        storage_provider: 'digitalocean',
        storage_bucket: process.env.DO_SPACES_BUCKET,
        storage_key: doKey,
        status: 'completed',
        metadata: {
          twilio_url: recordingUrl,
          recording_sid: recordingSid,
          processed_at: new Date(),
          company_id: call.company_id
        }
      } as any);

      // Update call record
      await call.update({
        recording_url: doUrl,
        recording_duration: duration
      });

      // Delete from Twilio after successful upload
      try {
        await TwilioService.deleteRecording(recordingSid);
        console.log('Deleted recording from Twilio:', recordingSid);
      } catch (error) {
        console.error('Failed to delete Twilio recording:', recordingSid, error);
        // Don't fail the process if deletion fails
      }

      return recording;
    } catch (error) {
      console.error('Error processing recording:', error);
      throw error;
    }
  }

  async getRecordingUrl(recording: CallRecording): Promise<string> {
    // If using private ACL, generate signed URL
    if (recording.storage_provider === 'digitalocean' && recording.storage_key) {
      return storage.getSignedUrl(recording.storage_key, 3600); // 1 hour expiry
    }
    
    if (!recording.file_url) {
      throw new Error('Recording URL not found');
    }
    
    return recording.file_url;
  }

  // async deleteRecording(recordingId: number): Promise<void> {
  //   const recording = await CallRecording.findByPk(recordingId);
  //   if (!recording) throw new Error('Recording not found');

  //   // Delete from storage
  //   if (recording.storage_provider === 'digitalocean' && recording.storage_key) {
  //     try {
  //       await storage.deleteRecording(recording.storage_key);
  //     } catch (error) {
  //       console.error('Error deleting file from storage:', error);
  //     }
  //   }

  //   // Delete database record
  //   await recording.destroy();
  // }
}

export default new RecordingService();