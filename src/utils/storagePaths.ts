// backend/src/utils/storagePaths.ts
export class StoragePaths {
  // For date-based structure (recommended)
  static getCallPath(companyId: number, callSid: string, date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `calls/${companyId}/${year}/${month}/${day}/${callSid}.mp3`;
  }

  // For simple structure
//   static getSimpleCallPath(companyId: number, callSid: string): string {
//     return `calls/${companyId}_${callSid}.mp3`;
//   }

  static getTranscriptPath(companyId: number, callSid: string): string {
    return `transcripts/${companyId}_${callSid}.json`;
  }

  static getAnalyticsPath(companyId: number, callSid: string): string {
    return `analytics/${companyId}_${callSid}_analysis.json`;
  }

  static getExportPath(companyId: number, exportId: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `exports/${companyId}_${exportId}_${timestamp}.csv`;
  }
}