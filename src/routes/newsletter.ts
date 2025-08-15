// src/routes/newsletter.ts
import { Router, Request, Response } from 'express';
import BrevoService from '../services/BrevoService';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * Public endpoint for newsletter subscription
 * Can be called from registration form or standalone newsletter signup
 */
router.post('/subscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, firstName, lastName, phone } = req.body;
    
    // Validate email is provided
    if (!email) {
      res.status(400).json({ error: 'Email address is required' });
      return;
    }
    
    // Add to Brevo list
    const result = await BrevoService.addContactToEmailList(email, firstName, lastName, phone);
    
    res.json({
      success: true,
      message: 'Successfully subscribed to our mailing list',
      email
    });
  } catch (error: any) {
    console.error('Newsletter subscription error:', error);
    
    // User-friendly error messages
    let message = 'Failed to subscribe to newsletter';
    if (error.message.includes('Invalid email')) {
      message = 'Please provide a valid email address';
    } else if (error.message.includes('already exists')) {
      // Don't reveal that email already exists for privacy
      res.json({
        success: true,
        message: 'Successfully subscribed to our mailing list',
        email: req.body.email
      });
      return;
    }
    
    res.status(400).json({ error: message });
  }
});

/**
 * Protected endpoint to check subscription status
 */
router.get('/status/:email', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.params;
    
    // This would require implementing a getContactInfo method in BrevoService
    // For now, just return a placeholder
    res.json({
      email,
      subscribed: true, // Would check actual status
      listId: 7
    });
  } catch (error) {
    console.error('Error checking subscription status:', error);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
});

export default router;