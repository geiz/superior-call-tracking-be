import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  HasMany,
  Default,
  AllowNull,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import { ConversationStatus } from '../types/enums';
import Company from './Company';
import TrackingNumber from './TrackingNumber';
import User from './User';
import TextMessage from './TextMessage';

@Table({
  tableName: 'text_conversations',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['company_id', 'tracking_number_id', 'customer_number']
    }
  ]
})
export default class TextConversation extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  uuid!: string;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

  @ForeignKey(() => TrackingNumber)
  @Column(DataType.INTEGER)
  tracking_number_id?: number;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  customer_number!: string;

  @Column(DataType.STRING(255))
  customer_name?: string;

  @Default(ConversationStatus.ACTIVE)
  @Column(DataType.ENUM(...Object.values(ConversationStatus)))
  status!: ConversationStatus;

  @Default(0)
  @Column(DataType.INTEGER)
  unread_count!: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  assigned_agent_id?: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  last_agent_id?: number;

  @Column(DataType.STRING(100))
  source?: string;

  @Column(DataType.DATE)
  first_message_at?: Date;

  @Column(DataType.DATE)
  last_message_at?: Date;

  @Column(DataType.STRING(1000))
  last_message?: string;

  @Column(DataType.INTEGER)
  message_count?: number;

  // Associations
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => TrackingNumber)
  tracking_number?: TrackingNumber;

  @BelongsTo(() => User, 'assigned_agent_id')
  assigned_agent?: User;

  @BelongsTo(() => User, 'last_agent_id')
  last_agent?: User;

  @HasMany(() => TextMessage)
  messages!: TextMessage[];

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;
}