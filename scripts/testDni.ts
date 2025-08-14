// backend/scripts/testDni.ts - Script to test DNI functionality

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const COMPANY_ID = '1'; // Change this to your test company ID

interface TestResult {
  step: string;
  success: boolean;
  data?: any;
  error?: any;
}

class DniTester {
  private results: TestResult[] = [];
  private visitorId: string | null = null;
  private assignedNumber: string | null = null;
  private authToken: string | null = null;

  async runTests() {
    console.log('🚀 Starting DNI Tests...\n');

    // Authenticate first (optional, for admin endpoints)
    await this.authenticate();

    // Test 1: Create visitor session
    await this.testCreateVisitor();

    // Test 2: Get visitor session
    await this.testGetVisitor();

    // Test 3: Track page view
    await this.testTrackPageView();

    // Test 4: Track form submission
    await this.testTrackFormSubmission();

    // Test 5: Get pool status (requires auth)
    if (this.authToken) {
      await this.testGetPoolStatus();
    }

    // Print results
    this.printResults();
  }

  private async authenticate() {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email: 'admin@demo.com', // Change to your test credentials
        password: 'password123'
      });

      this.authToken = response.data.token;
      this.results.push({
        step: 'Authentication',
        success: true,
        data: { token: this.authToken?.substring(0, 20) + '...' }
      });
    } catch (error: any) {
      console.warn('⚠️  Authentication failed - admin endpoints will be skipped');
      this.results.push({
        step: 'Authentication',
        success: false,
        error: error.response?.data || error.message
      });
    }
  }

  private async testCreateVisitor() {
    try {
      const response = await axios.post(`${API_URL}/dni/visitor`, {
        company_id: COMPANY_ID,
        page_url: 'https://example.com/landing-page',
        page_title: 'Test Landing Page',
        referrer: 'https://google.com',
        user_agent: 'Mozilla/5.0 (Test DNI Script)',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'test-campaign',
        gclid: 'test_gclid_123'
      });

      this.visitorId = response.data.visitor_id;
      this.assignedNumber = response.data.assigned_number;

      this.results.push({
        step: 'Create Visitor Session',
        success: true,
        data: response.data
      });
    } catch (error: any) {
      this.results.push({
        step: 'Create Visitor Session',
        success: false,
        error: error.response?.data || error.message
      });
    }
  }

  private async testGetVisitor() {
    if (!this.visitorId) {
      this.results.push({
        step: 'Get Visitor Session',
        success: false,
        error: 'No visitor ID available'
      });
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/dni/visitor/${this.visitorId}`);

      this.results.push({
        step: 'Get Visitor Session',
        success: true,
        data: response.data
      });
    } catch (error: any) {
      this.results.push({
        step: 'Get Visitor Session',
        success: false,
        error: error.response?.data || error.message
      });
    }
  }

  private async testTrackPageView() {
    if (!this.visitorId) {
      this.results.push({
        step: 'Track Page View',
        success: false,
        error: 'No visitor ID available'
      });
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/dni/track/pageview`, {
        visitor_id: this.visitorId,
        company_id: COMPANY_ID,
        page_url: 'https://example.com/products',
        page_title: 'Products Page',
        referrer: 'https://example.com/landing-page',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'test-campaign'
      });

      this.results.push({
        step: 'Track Page View',
        success: true,
        data: response.data
      });
    } catch (error: any) {
      this.results.push({
        step: 'Track Page View',
        success: false,
        error: error.response?.data || error.message
      });
    }
  }

  private async testTrackFormSubmission() {
    if (!this.visitorId) {
      this.results.push({
        step: 'Track Form Submission',
        success: false,
        error: 'No visitor ID available'
      });
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/dni/track/form`, {
        visitor_id: this.visitorId,
        company_id: COMPANY_ID,
        form_id: 'contact-form',
        form_name: 'Contact Us',
        page_url: 'https://example.com/contact',
        fields: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          message: 'I saw your number: ' + this.assignedNumber
        }
      });

      this.results.push({
        step: 'Track Form Submission',
        success: true,
        data: response.data
      });
    } catch (error: any) {
      this.results.push({
        step: 'Track Form Submission',
        success: false,
        error: error.response?.data || error.message
      });
    }
  }

  private async testGetPoolStatus() {
    try {
      const response = await axios.get(`${API_URL}/dni/pool/${COMPANY_ID}`, {
        headers: {
          Authorization: `Bearer ${this.authToken}`
        }
      });

      this.results.push({
        step: 'Get Pool Status',
        success: true,
        data: response.data
      });
    } catch (error: any) {
      this.results.push({
        step: 'Get Pool Status',
        success: false,
        error: error.response?.data || error.message
      });
    }
  }

  private printResults() {
    console.log('\n📊 Test Results:\n');
    console.log('═'.repeat(80));

    let successCount = 0;
    let failureCount = 0;

    this.results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.step}`);
      
      if (result.success) {
        successCount++;
        if (result.data) {
          console.log('   Data:', JSON.stringify(result.data, null, 2));
        }
      } else {
        failureCount++;
        console.log('   Error:', result.error);
      }
      
      if (index < this.results.length - 1) {
        console.log('─'.repeat(80));
      }
    });

    console.log('═'.repeat(80));
    console.log(`\n📈 Summary: ${successCount} passed, ${failureCount} failed`);

    if (this.visitorId && this.assignedNumber) {
      console.log('\n🎯 Key Results:');
      console.log(`   Visitor ID: ${this.visitorId}`);
      console.log(`   Assigned Number: ${this.assignedNumber}`);
    }
  }
}

// Run the tests
const tester = new DniTester();
tester.runTests().catch(console.error);