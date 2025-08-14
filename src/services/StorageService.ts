// backend/src/services/StorageService.ts
import AWS from 'aws-sdk';
import axios from 'axios';
import { storageConfig } from '../config/storage';

export class StorageService {
  private s3Client: AWS.S3;
  private bucketName: string;

  constructor() {
    // Configure DigitalOcean Spaces (S3-compatible)
    this.s3Client = new AWS.S3({
      endpoint: new AWS.Endpoint(
        process.env.DO_SPACES_ENDPOINT || 'https://nyc3.digitaloceanspaces.com'
      ),
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
      region: process.env.DO_SPACES_REGION || 'nyc3',
      s3ForcePathStyle: false,
      signatureVersion: 'v4'
    });
    
    this.bucketName = process.env.DO_SPACES_BUCKET || 'crc-bucket';
    
    // Log configuration (remove in production)
    console.log('Storage Service initialized with:', {
      endpoint: process.env.DO_SPACES_ENDPOINT,
      bucket: this.bucketName,
      region: process.env.DO_SPACES_REGION,
      hasKey: !!process.env.DO_SPACES_KEY,
      hasSecret: !!process.env.DO_SPACES_SECRET
    });
  }

  /**
   * Generate signed URL for secure file access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn
      };
      
      const url = await this.s3Client.getSignedUrlPromise('getObject', params);
      console.log('Generated signed URL for key:', key);
      return url;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw error;
    }
  }

  /**
   * Generate signed URL for download with proper headers
   */
  async getDownloadUrl(key: string, filename: string): Promise<string> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: 3600,
        ResponseContentDisposition: `attachment; filename="${filename}"`
      };
      
      return await this.s3Client.getSignedUrlPromise('getObject', params);
    } catch (error) {
      console.error('Error generating download URL:', error);
      throw error;
    }
  }

  /**
   * Upload recording from Twilio to DO Spaces
   */
  async uploadRecordingFromTwilio(
    twilioUrl: string,
    callSid: string,
    companyId: number
  ): Promise<{ key: string; url: string }> {
    try {
      // Download from Twilio with auth
      const response = await axios({
        method: 'GET',
        url: twilioUrl,
        responseType: 'stream',
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID!,
          password: process.env.TWILIO_AUTH_TOKEN!
        }
      });

      // Generate unique key
      const date = new Date();
      const key = `recordings/${companyId}/${date.getFullYear()}/${
        date.getMonth() + 1
      }/${callSid}.mp3`;

      // Upload to DO Spaces
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: response.data,
        ContentType: 'audio/mpeg',
        ACL: 'private', // Important: Keep recordings private
        Metadata: {
          'call-sid': callSid,
          'company-id': companyId.toString(),
          'uploaded-at': new Date().toISOString()
        }
      };

      const result = await this.s3Client.upload(uploadParams).promise();
      console.log('Upload successful:', result.Location);

      return {
        key,
        url: result.Location
      };
    } catch (error) {
      console.error('Error uploading recording:', error);
      throw error;
    }
  }

  /**
   * Check if bucket is accessible
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.s3Client.headBucket({ Bucket: this.bucketName }).promise();
      console.log('✅ Successfully connected to DigitalOcean Spaces');
      return true;
    } catch (error: any) {
      console.error('❌ Failed to connect to DigitalOcean Spaces:', error.message);
      return false;
    }
  }

  /**
   * Create bucket if it doesn't exist
   */
  async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.headBucket({ Bucket: this.bucketName }).promise();
      console.log('Bucket exists:', this.bucketName);
    } catch (error: any) {
      if (error.statusCode === 404) {
        console.log('Creating bucket:', this.bucketName);
        await this.s3Client.createBucket({ 
          Bucket: this.bucketName,
          ACL: 'private'
        }).promise();
        
        // Set CORS configuration
        await this.setCORSConfiguration();
      } else {
        throw error;
      }
    }
  }

  /**
   * Set CORS configuration for the bucket
   */
  private async setCORSConfiguration(): Promise<void> {
    const corsParams = {
      Bucket: this.bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedOrigins: [
              process.env.FRONTEND_URL || 'http://localhost:5173',
              'http://localhost:3000',
              'http://localhost:3001',
              'https://0c6f6b3d8a66.ngrok-free.app',
              'https://f04de7477bc3.ngrok-free.app',
            ],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3000
          }
        ]
      }
    };

    try {
      await this.s3Client.putBucketCors(corsParams).promise();
      console.log('CORS configuration set successfully');
    } catch (error) {
      console.error('Error setting CORS:', error);
    }
  }
}

// Export singleton instance
export default new StorageService();