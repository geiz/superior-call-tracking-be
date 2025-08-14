// backend/src/models/index.ts
import { Sequelize } from 'sequelize-typescript';
import path from 'path';

// Import all models
import Company from './Company';
import User from './User';
import AgentSession from './AgentSession';
import Account from './Account';
import TrackingNumber from './TrackingNumber';
import Call from './Call';
import CallRecording from './CallRecording';
import Tag from './Tag';
import CallTag from './CallTag';
import TextConversation from './TextConversation';
import TextMessage from './TextMessage';
import CustomerProfile from './CustomerProfile';
import Visitor from './Visitor';
import PageView from './PageView';
import FormSubmission from './FormSubmission';
import Webhook from './Webhook';
import WebhookDelivery from './WebhookDelivery';
import SipEvent from './SipEvent';
import UserInvitation from './UserInvitation';
import UserCompany from './UserCompany';

// Initialize Sequelize with configuration
const sequelize = new Sequelize({
  database: process.env.DB_NAME || 'crc_db',
  dialect: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '25060'),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  models: [
    Account,
    Company,
    User,
    AgentSession,
    TrackingNumber,
    Call,
    CallRecording,
    Tag,
    CallTag,
    TextConversation,
    TextMessage,
    CustomerProfile,
    Visitor,
    PageView,
    FormSubmission,
    Webhook,
    WebhookDelivery,
    SipEvent,
    UserInvitation,
    UserCompany,
  ],
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true
  }
});

// Export all models and sequelize instance
export {
  Account,
  sequelize,
  Company,
  User,
  AgentSession,
  TrackingNumber,
  Call,
  CallRecording,
  Tag,
  CallTag,
  TextConversation,
  TextMessage,
  CustomerProfile,
  Visitor,
  PageView,
  FormSubmission,
  Webhook,
  WebhookDelivery,
  SipEvent,
  UserInvitation,
  UserCompany,
};

export * from '../types/enums';