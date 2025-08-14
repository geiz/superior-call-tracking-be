import axios from 'axios';
import { Call } from '../models';

interface CallerIdInfo {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  carrier?: string;
  line_type?: string;
}

export class CallerIdService {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = process.env.CALLER_ID_API_KEY || '';
    this.apiUrl = 'https://api.callerlookup.com/v1/lookup';
  }

  async lookupNumber(phoneNumber: string): Promise<CallerIdInfo | null> {
    if (!this.apiKey) {
      console.log('Caller ID API key not configured');
      return null;
    }

    try {
      const response = await axios.get(this.apiUrl, {
        params: {
          phone: phoneNumber,
          api_key: this.apiKey
        },
        timeout: 5000
      });

      if (response.data && response.data.success) {
        return {
          name: response.data.name,
          city: response.data.city,
          state: response.data.state,
          country: response.data.country || 'CA',
          zip: response.data.zip,
          latitude: response.data.latitude,
          longitude: response.data.longitude,
          carrier: response.data.carrier,
          line_type: response.data.line_type
        };
      }

      return null;
    } catch (error) {
      console.error('Caller ID lookup error:', error);
      return null;
    }
  }

  async enrichCall(callId: number): Promise<void> {
    try {
      const call = await Call.findByPk(callId);
      if (!call || call.caller_name) return;

      const info = await this.lookupNumber(call.caller_number);
      if (!info) return;

      await call.update({
        caller_name: info.name,
        caller_city: info.city,
        caller_state: info.state,
        caller_country: info.country,
        caller_zip: info.zip,
        latitude: info.latitude,
        longitude: info.longitude
      });
    } catch (error) {
      console.error('Error enriching call:', error);
    }
  }
}

export default new CallerIdService();