import { Response } from 'express';
import { sequelize } from '../models';
import { AuthRequest } from '../middleware/auth';
import { Call, CallRecording } from '../models';
import RecordingService from '../services/RecordingService';
import fs from 'fs';
import path from 'path';

class RecordingController {
  async getRecording(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const recording = await CallRecording.findOne({
        where: { id: parseInt(id) },
        include: [{
          model: Call,
          where: { company_id: req.user!.company_id }
        }]
      });

      if (!recording) {
        res.status(404).json({ error: 'Recording not found' });
        return;
      }

      res.json(recording);
    } catch (error) {
      console.error('Error fetching recording:', error);
      res.status(500).json({ error: 'Failed to fetch recording' });
    }
  }

  async playRecording(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const recording = await CallRecording.findOne({
        where: { id: parseInt(id) },
        include: [{
          model: Call,
          where: { company_id: req.user!.company_id }
        }]
      });

      if (!recording) {
        res.status(404).json({ error: 'Recording not found' });
        return;
      }

      // Get signed URL for streaming (handles both DO and legacy)
      const streamUrl = await RecordingService.getRecordingUrl(recording);

      // Redirect to the streaming URL
      res.redirect(streamUrl);
    } catch (error) {
      console.error('Error playing recording:', error);
      res.status(500).json({ error: 'Failed to play recording' });
    }
  }

  async downloadRecording(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const recording = await CallRecording.findOne({
        where: { id: parseInt(id) },
        include: [{
          model: Call,
          where: { company_id: req.user!.company_id }
        }]
      });

      if (!recording) {
        res.status(404).json({ error: 'Recording not found' });
        return;
      }

      // For Digital Ocean storage, generate signed URL and redirect
      if (recording.storage_provider === 'digitalocean' || recording.file_url?.startsWith('http')) {
        const downloadUrl = await RecordingService.getRecordingUrl(recording);
        res.redirect(downloadUrl);
        return;
      }

      // For local storage (legacy support)
      const filePath = recording.file_path;

      // Check if file_path exists and is valid
      if (!filePath) {
        res.status(404).json({ error: 'Recording file path not found' });
        return;
      }

      // Now TypeScript knows filePath is defined
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Recording file not found' });
        return;
      }

      const filename = `call-recording-${recording.call.call_sid}.${recording.format}`;
      res.download(filePath, filename);
    } catch (error) {
      console.error('Error downloading recording:', error);
      res.status(500).json({ error: 'Failed to download recording' });
    }
  }

  // async deleteRecording(req: AuthRequest, res: Response): Promise<void> {
  //   try {
  //     const { id } = req.params;

  //     const recording = await CallRecording.findOne({
  //       where: { id: parseInt(id) },
  //       include: [{
  //         model: Call,
  //         where: { company_id: req.user!.company_id }
  //       }]
  //     });

  //     if (!recording) {
  //       res.status(404).json({ error: 'Recording not found' });
  //       return;
  //     }

  //     await RecordingService.deleteRecording(recording.id);
  //     res.json({ message: 'Recording deleted successfully' });
  //   } catch (error) {
  //     console.error('Error deleting recording:', error);
  //     res.status(500).json({ error: 'Failed to delete recording' });
  //   }
  // }

  async getTranscription(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const call = await Call.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!call) {
        res.status(404).json({ error: 'Call not found' });
        return;
      }

      if (!call.transcription) {
        res.status(404).json({ error: 'Transcription not available' });
        return;
      }

      res.json({
        transcription: call.transcription,
        confidence: call.transcription_confidence,
        status: call.transcription_status
      });
    } catch (error) {
      console.error('Error fetching transcription:', error);
      res.status(500).json({ error: 'Failed to fetch transcription' });
    }
  }
}

export default new RecordingController();