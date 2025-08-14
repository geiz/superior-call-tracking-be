import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  Default,
  AllowNull,
  Unique,
  CreatedAt
  } from 'sequelize-typescript';
import { MessageDirection, MessageStatus } from '../types/enums';
import TextConversation from './TextConversation';
import Company from './Company';
import User from './User';
import AgentSession from './AgentSession';

@Table({
  tableName: 'text_messages',
  timestamps: true,
  underscored: true
})
export default class TextMessage extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  uuid!: string;

  @ForeignKey(() => TextConversation)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  conversation_id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

  @Unique
  @Column(DataType.STRING(100))
  message_sid?: string;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(MessageDirection)))
  direction!: MessageDirection;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  from_number!: string;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  to_number!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  body!: string;

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  media_urls!: string[];

  @Default(0)
  @Column(DataType.INTEGER)
  media_count!: number;

  @Default(MessageStatus.SENT)
  @Column(DataType.ENUM(...Object.values(MessageStatus)))
  status!: MessageStatus;

  @Column(DataType.STRING(50))
  error_code?: string;

  @Column(DataType.TEXT)
  error_message?: string;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  agent_id?: number;

  @ForeignKey(() => AgentSession)
  @Column(DataType.INTEGER)
  agent_session_id?: number;

  @Column(DataType.DATE)
  read_at?: Date;

  @Column(DataType.STRING(20))
  sentiment?: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  contains_question!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  urgent!: boolean;

  @Column(DataType.STRING(50))
  provider?: string;

  @Column(DataType.DECIMAL(10, 4))
  provider_cost?: number;

  @Column(DataType.DATE)
  sent_at?: Date;

  @Column(DataType.DATE)
  delivered_at?: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  // Associations
  @BelongsTo(() => TextConversation)
  conversation!: TextConversation;

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User, 'agent_id')
  agent?: User;

  @BelongsTo(() => AgentSession)
  agent_session?: AgentSession;
}