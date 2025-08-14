// backend/src/services/TwilioService.ts
import twilio from 'twilio';
import type { Twilio } from 'twilio';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  baseUrl: string;
}

interface ProvisionedNumber {
  phoneNumber: string;
  sid: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

// Define the options interface based on actual Twilio SDK
interface AvailableNumberSearchOptions {
  areaCode?: number;
  contains?: string;
  smsEnabled?: boolean;
  mmsEnabled?: boolean;
  voiceEnabled?: boolean;
  excludeAllAddressRequired?: boolean;
  excludeLocalAddressRequired?: boolean;
  excludeForeignAddressRequired?: boolean;
  beta?: boolean;
  nearNumber?: string;
  nearLatLong?: string;
  distance?: number;
  inPostalCode?: string;
  inRegion?: string;
  inRateCenter?: string;
  inLata?: string;
  inLocality?: string;
  faxEnabled?: boolean;
  limit?: number;
}

export class TwilioService {
  public readonly client: Twilio; // Made public readonly for access in controllers
  private config: TwilioConfig;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    this.config = {
      accountSid,
      authToken,
      baseUrl
    };

    this.client = twilio(accountSid, authToken);
  }

  /**
   * Search for available phone numbers
   */
  async searchAvailableNumbers(areaCode?: string): Promise<any[]> {
    try {
      const options: AvailableNumberSearchOptions = {
        voiceEnabled: true,
        smsEnabled: true,
        limit: 10
      };

      // Only add areaCode if provided and convert to number
      if (areaCode) {
        const areaCodeNum = parseInt(areaCode, 10);
        if (!isNaN(areaCodeNum)) {
          options.areaCode = areaCodeNum;
        }
      }

      const numbers = await this.client.availablePhoneNumbers('CA')
        .local
        .list(options as any); // Type assertion needed due to SDK typing issues

      return numbers;
    } catch (error) {
      console.error('Error searching for numbers:', error);
      throw new Error('Failed to search available numbers');
    }
  }

  /**
 * Purchase a phone number from Twilio
 */
  async provisionNumber(phoneNumber: string, friendlyName?: string): Promise<ProvisionedNumber> {
    try {
      const purchased = await this.client.incomingPhoneNumbers.create({
        phoneNumber,
        friendlyName: friendlyName || `Tracking - ${new Date().toISOString()}`,
        voiceUrl: `${this.config.baseUrl}/api/sip/incoming`,
        voiceMethod: 'POST',
        voiceFallbackUrl: `${this.config.baseUrl}/api/sip/fallback`,
        voiceFallbackMethod: 'POST',
        statusCallback: `${this.config.baseUrl}/api/sip/status`,
        statusCallbackMethod: 'POST',
        smsUrl: `${this.config.baseUrl}/api/texts/webhook/receive`,
        smsMethod: 'POST'
      });

      return {
        phoneNumber: purchased.phoneNumber,
        sid: purchased.sid,
        friendlyName: purchased.friendlyName || '',
        capabilities: {
          voice: purchased.capabilities.voice || false,
          sms: purchased.capabilities.sms || false,
          mms: purchased.capabilities.mms || false
        }
      };
    } catch (error: any) {
      console.error('Error provisioning number from Twilio:', error);

      // Extract meaningful error message from Twilio error
      const twilioError = {
        code: error.code || 'UNKNOWN',
        message: error.message || 'Failed to provision number',
        moreInfo: error.moreInfo || '',
        status: error.status || 500
      };

      // Common Twilio error codes for phone number provisioning
      switch (twilioError.code) {
        case 21421:
          throw new Error('Phone number is not available for purchase');
        case 21422:
          throw new Error('Invalid phone number format');
        case 21450:
          throw new Error('Phone number type not supported in this country');
        case 21451:
          throw new Error('Invalid area code');
        case 21452:
          throw new Error('No phone numbers available in this area code');
        case 21601:
          throw new Error('Phone number is already in use on your account');
        case 21631:
          throw new Error('Address is required for this phone number type');
        case 21649:
          throw new Error('Regulatory bundle is required for this phone number');
        case 22300:
          throw new Error('Account is restricted from provisioning phone numbers');
        case 20003:
          throw new Error('Authentication failed - check Twilio credentials');
        case 20008:
          throw new Error('Insufficient funds in Twilio account');
        default:
          throw new Error(twilioError.message || 'Failed to provision number from Twilio');
      }
    }
  }

  /**
   * Update an existing number's configuration
   */
  async updateNumberConfiguration(
    phoneNumber: string,
    config: {
      voiceUrl?: string;
      smsUrl?: string;
      friendlyName?: string;
    }
  ): Promise<void> {
    try {
      const numbers = await this.client.incomingPhoneNumbers.list({
        phoneNumber,
        limit: 1
      });

      if (numbers.length === 0) {
        throw new Error('Number not found in Twilio account');
      }

      await numbers[0].update({
        voiceUrl: config.voiceUrl || `${this.config.baseUrl}/api/sip/incoming`,
        smsUrl: config.smsUrl || `${this.config.baseUrl}/api/texts/webhook/receive`,
        voiceMethod: 'POST',
        smsMethod: 'POST',
        ...(config.friendlyName && { friendlyName: config.friendlyName })
      });
    } catch (error) {
      console.error('Error updating number configuration:', error);
      throw new Error('Failed to update number configuration');
    }
  }

  /**
 * Release a phone number back to Twilio
 */
  async releaseNumber(sid: string): Promise<void> {
    try {
      await this.client.incomingPhoneNumbers(sid).remove();
    } catch (error: any) {
      console.error('Error releasing number from Twilio:', error);

      const twilioError = {
        code: error.code || 'UNKNOWN',
        message: error.message || 'Failed to release number',
        status: error.status || 500
      };

      // Common Twilio error codes for releasing numbers
      switch (twilioError.code) {
        case 20404:
          throw new Error('Phone number not found in your Twilio account');
        case 20003:
          throw new Error('Authentication failed - check Twilio credentials');
        case 21220:
          throw new Error('Cannot release number - it may have pending charges');
        default:
          throw new Error(twilioError.message || 'Failed to release number from Twilio');
      }
    }
  }


  async deleteRecording(recordingSid: string): Promise<void> {
    try {
      await this.client.recordings(recordingSid).remove();
    } catch (error: any) {
      if (error.status === 404) {
        console.log('Recording already deleted or not found:', recordingSid);
        return;
      }
      throw error;
    }
  }

  async getRecording(recordingSid: string) {
    try {
      const recording = await this.client.recordings(recordingSid).fetch();
      return {
        sid: recording.sid,
        callSid: recording.callSid,
        duration: parseInt(recording.duration),
        dateCreated: recording.dateCreated,
        uri: recording.uri,
        status: recording.status
      };
    } catch (error) {
      console.error('Error fetching recording details:', error);
      return null;
    }
  }

  /**
   * Get call details from Twilio
   */
  async getCallDetails(callSid: string) {
    try {
      const call = await this.client.calls(callSid).fetch();
      return {
        status: call.status,
        duration: parseInt(call.duration || '0', 10),
        price: call.price ? parseFloat(call.price) : 0,
        priceUnit: call.priceUnit,
        direction: call.direction,
        answeredBy: call.answeredBy,
        callerName: call.callerName,
        from: call.from,
        to: call.to,
        startTime: call.startTime,
        endTime: call.endTime
      };
    } catch (error) {
      console.error('Error fetching call details:', error);
      return null;
    }
  }

  /**
   * Send SMS message
   */
  async sendSMS(from: string, to: string, body: string): Promise<string> {
    try {
      const message = await this.client.messages.create({
        from,
        to,
        body,
        statusCallback: `${this.config.baseUrl}/api/texts/webhook/status`
      });

      return message.sid;
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw new Error('Failed to send SMS');
    }
  }

  /**
   * Lookup phone number information
   */
  async lookupPhoneNumber(phoneNumber: string) {
    try {
      const lookup = await this.client.lookups.v1
        .phoneNumbers(phoneNumber)
        .fetch({ type: ['caller-name', 'carrier'] });

      return {
        phoneNumber: lookup.phoneNumber,
        nationalFormat: lookup.nationalFormat,
        countryCode: lookup.countryCode,
        callerName: lookup.callerName?.caller_name,
        callerType: lookup.callerName?.caller_type,
        carrier: {
          name: lookup.carrier?.name,
          type: lookup.carrier?.type,
          mobileCountryCode: lookup.carrier?.mobile_country_code,
          mobileNetworkCode: lookup.carrier?.mobile_network_code
        }
      };
    } catch (error) {
      console.error('Error looking up phone number:', error);
      return null;
    }
  }

  public getClient(): Twilio {
    return this.client;
  }
}

let twilioServiceInstance: TwilioService | null = null;

const getTwilioService = (): TwilioService => {
  if (!twilioServiceInstance) {
    try {
      twilioServiceInstance = new TwilioService();
    } catch (error) {
      console.error('Failed to initialize Twilio service:', error);
      throw error;
    }
  }
  return twilioServiceInstance;
};

export default getTwilioService();