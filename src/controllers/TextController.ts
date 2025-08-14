// Solves conflict Between Request in DOM & in Express. 
import { Request as ExpressRequest, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import WebhookService from '../services/WebhookService';
import { WebhookEvent } from '../types/enums';
import { Op } from 'sequelize';
import { TextConversation, TextMessage, TrackingNumber } from '../models';
import { MessageDirection, MessageStatus } from '../types/enums';

class TextController {
  async getConversations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { status, unread, page = 1, limit = 50 } = req.query;

      const where: any = {
        company_id: req.user!.company_id
      };

      if (status) where.status = status;
      if (unread === 'true') where.unread_count = { [Op.gt]: 0 };

      const offset = ((page as number) - 1) * (limit as number);

      const { rows: conversations, count } = await TextConversation.findAndCountAll({
        where,
        include: [
          {
            model: TrackingNumber,
            attributes: ['phone_number', 'friendly_name']
          },
          {
            model: TextMessage,
            limit: 1,
            order: [['created_at', 'DESC']],
            attributes: ['body', 'direction', 'created_at']
          }
        ],
        limit: parseInt(limit as string),
        offset,
        order: [['last_message_at', 'DESC']],
        distinct: true
      });

      res.json({
        conversations,
        pagination: {
          total: count,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          pages: Math.ceil(count / (limit as number))
        }
      });
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  }

  async getConversationMessages(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const conversation = await TextConversation.findOne({
        where: { 
          id: parseInt(id),
          company_id: req.user!.company_id 
        },
        include: [TrackingNumber]
      });

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      const offset = ((page as number) - 1) * (limit as number);

      const messages = await TextMessage.findAndCountAll({
        where: { conversation_id: conversation.id },
        limit: parseInt(limit as string),
        offset,
        order: [['created_at', 'DESC']],
        attributes: ['body', 'direction', 'created_at']
      });

      // Mark messages as read
      await TextMessage.update(
        { 
          read_at: new Date(),
          status: MessageStatus.READ 
        },
        { 
          where: { 
            conversation_id: conversation.id, 
            direction: MessageDirection.INBOUND, 
            read_at: null 
          } 
        }
      );

      // Update unread count
      await conversation.update({ unread_count: 0 });

      res.json({
        conversation,
        messages: messages.rows.reverse(), // Reverse to show oldest first
        pagination: {
          total: messages.count,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          pages: Math.ceil(messages.count / (limit as number))
        }
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }

  async sendMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { conversation_id, to_number, body } = req.body;

      let conversation: TextConversation | null = null;
      
      if (conversation_id) {
        conversation = await TextConversation.findOne({
          where: { 
            id: conversation_id,
            company_id: req.user!.company_id 
          },
          include: [TrackingNumber]
        });

        if (!conversation) {
          res.status(404).json({ error: 'Conversation not found' });
          return;
        }
      } else if (to_number) {
        // Find an SMS-enabled tracking number
        const trackingNumber = await TrackingNumber.findOne({
          where: { 
            company_id: req.user!.company_id,
            sms_enabled: true,
            status: 'active'
          },
          order: [['created_at', 'DESC']]
        });

        if (!trackingNumber) {
          res.status(400).json({ error: 'No SMS-enabled tracking number available' });
          return;
        }

        // Create or find conversation
        [conversation] = await TextConversation.findOrCreate({
          where: {
            company_id: req.user!.company_id,
            tracking_number_id: trackingNumber.id,
            customer_number: to_number
          },
          defaults: {
            first_message_at: new Date(),
            last_message_at: new Date()
          }
        });
      } else {
        res.status(400).json({ error: 'Conversation ID or phone number required' });
        return;
      }

      // Create message
      const message = await TextMessage.create({
        conversation_id: conversation.id,
        company_id: req.user!.company_id,
        direction: MessageDirection.OUTBOUND,
        from_number: conversation.tracking_number?.phone_number || '',
        to_number: conversation.customer_number,
        body,
        agent_id: req.user!.id,
        status: MessageStatus.SENDING,
        sent_at: new Date()
      });

      // Update conversation
      await conversation.update({
        last_message_at: new Date(),
        last_agent_id: req.user!.id,
        status: 'active'
      });

      // TODO: Send actual SMS via provider
      // For now, simulate success after a short delay
      setTimeout(async () => {
        await message.update({ 
          status: MessageStatus.SENT,
          delivered_at: new Date()
        });
        
        req.socketManager?.emitToCompany(
          req.user!.company_id,
          'text:sent',
          message
        );
      }, 1000);

      res.status(201).json(message);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }

  async receiveMessage(req: ExpressRequest, res: Response): Promise<void> {
    try {
      const { From: from, To: to, Body: body, MessageSid: message_sid } = req.body;

      // Find tracking number
      const trackingNumber = await TrackingNumber.findOne({
        where: { phone_number: to }
      });

      if (!trackingNumber) {
        res.status(404).json({ error: 'Tracking number not found' });
        return;
      }

      // Find or create conversation
      const [conversation] = await TextConversation.findOrCreate({
        where: {
          company_id: trackingNumber.company_id,
          tracking_number_id: trackingNumber.id,
          customer_number: from
        },
        defaults: {
          first_message_at: new Date()
        }
      });

      // Create message
      const message = await TextMessage.create({
        conversation_id: conversation.id,
        company_id: trackingNumber.company_id,
        message_sid,
        direction: MessageDirection.INBOUND,
        from_number: from,
        to_number: to,
        body,
        status: MessageStatus.RECEIVED,
        sent_at: new Date()
      });

      // Update conversation
      await conversation.update({
        last_message_at: new Date(),
        unread_count: conversation.unread_count + 1,
        status: 'active'
      });

      // Emit real-time update
      req.socketManager?.emitToCompany(
        trackingNumber.company_id,
        'text:received',
        {
          conversation,
          message
        }
      );

      // Trigger webhook
      await WebhookService.triggerWebhooks(
        trackingNumber.company_id,
        WebhookEvent.TEXT_RECEIVED,
        message.uuid,
        {
          message_id: message.uuid,
          from: from,
          to: to,
          body: body,
          tracking_number: trackingNumber.friendly_name
        }
      );

      res.status(200).send('Message received');
    } catch (error) {
      console.error('Error receiving message:', error);
      res.status(500).send('Failed to receive message');
    }
  }

  async archiveConversation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const conversation = await TextConversation.findOne({
        where: { 
          id: parseInt(id),
          company_id: req.user!.company_id 
        }
      });

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      await conversation.update({ status: 'archived' });
      res.json({ message: 'Conversation archived' });
    } catch (error) {
      console.error('Error archiving conversation:', error);
      res.status(500).json({ error: 'Failed to archive conversation' });
    }
  }
}

export default new TextController();