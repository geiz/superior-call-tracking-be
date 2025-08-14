export const storageConfig = {
  provider: process.env.STORAGE_PROVIDER || 'spaces',
  spaces: {
    key: process.env.DO_SPACES_KEY!,
    secret: process.env.DO_SPACES_SECRET!,
    endpoint: process.env.DO_SPACES_ENDPOINT!,
    bucket: process.env.DO_SPACES_BUCKET!,
    region: process.env.DO_SPACES_REGION!,
    cdnEndpoint: process.env.DO_SPACES_CDN_ENDPOINT!
  },
  paths: {
    calls: 'calls',
    transcripts: 'transcripts',
    analytics: 'analytics',
    exports: 'exports'
  },
  retention: {
    recordings: parseInt(process.env.RECORDING_RETENTION_DAYS || '90'),
    transcripts: parseInt(process.env.TRANSCRIPT_RETENTION_DAYS || '365'),
    analytics: parseInt(process.env.ANALYTICS_RETENTION_DAYS || '730'),
    exports: parseInt(process.env.EXPORT_RETENTION_DAYS || '30')
  }
};