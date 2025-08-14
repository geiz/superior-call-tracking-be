// backend/src/jobs/dniCleanup.ts

import cron, { ScheduledTask } from 'node-cron';
import { DniService } from '../services/DniService';

export class DniCleanupJob {
  private static job: ScheduledTask | null = null;

  /**
   * Start the DNI cleanup cron job
   * Runs every 5 minutes to release expired number assignments
   */
  static start(): void {
    // Run every 5 minutes
    this.job = cron.schedule('* * * * *', async () => {
      try {
        console.log('Starting DNI session cleanup...');
        
        const startTime = Date.now();
        const cleaned = await DniService.cleanupExpiredSessions();
        const duration = Date.now() - startTime;
        
        console.log(`DNI cleanup completed: ${cleaned} sessions released in ${duration}ms`);
      } catch (error) {
        console.error('DNI cleanup job failed:', error);
      }
    });

    console.log('DNI cleanup job scheduled (runs every 5 minutes)');
  }

  /**
   * Stop the cron job
   */
  static stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('DNI cleanup job stopped');
    }
  }
}