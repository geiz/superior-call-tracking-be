// backend/src/models/UserInvitation.ts
import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  Unique,
  Default,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import { UserRole } from '../types/enums';
import Company from './Company';
import User from './User';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

@Table({
  tableName: 'user_invitations',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export default class UserInvitation extends Model<UserInvitation> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  uuid!: string;

  @ForeignKey(() => Company)
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  company_id!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  email!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false
  })
  first_name!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false
  })
  last_name!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  temp_password!: string;

  @Column({
    type: DataType.ENUM(...Object.values(UserRole)),
    allowNull: false
  })
  role!: UserRole;

  @Default(InvitationStatus.PENDING)
  @Column({
    type: DataType.ENUM(...Object.values(InvitationStatus)),
    allowNull: false
  })
  status!: InvitationStatus;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true
  })
  user_id?: number;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  invited_by!: number;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true
  })
  accepted_by?: number;

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  accepted_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
  })
  expires_at!: Date;

  @Column({
    type: DataType.STRING(20),
    allowNull: true
  })
  phone?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true
  })
  personal_note?: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false
  })
  email_sent!: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  email_sent_at?: Date;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0
  })
  email_send_attempts!: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Associations
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User, 'user_id')
  user?: User;

  @BelongsTo(() => User, 'invited_by')
  inviter!: User;

  @BelongsTo(() => User, 'accepted_by')
  acceptedByUser?: User;

  // Methods
  isExpired(): boolean {
    return new Date() > this.expires_at;
  }

  canBeAccepted(): boolean {
    return this.status === InvitationStatus.PENDING && !this.isExpired();
  }
}