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
  Unique,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import { AgentStatus } from '../types/enums';
import User from './User';
import Company from './Company';
import Call from './Call';

@Table({
  tableName: 'agent_sessions',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export default class AgentSession extends Model<AgentSession> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  uuid!: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  user_id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(255))
  session_id!: string;

  @Column(DataType.INET)
  ip_address?: string;

  @Column(DataType.TEXT)
  user_agent?: string;

  @Column(DataType.STRING(255))
  socket_id?: string;

  @Default(AgentStatus.AVAILABLE)
  @Column(DataType.ENUM(...Object.values(AgentStatus)))
  status!: AgentStatus;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_online!: boolean;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  started_at!: Date;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  last_activity!: Date;

  @Column(DataType.DATE)
  ended_at?: Date;

  // Call handling
  @ForeignKey(() => Call)
  @Column(DataType.INTEGER)
  current_call_id?: number;

  @Default(0)
  @Column(DataType.INTEGER)
  calls_handled!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  avg_handle_time!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  total_talk_time!: number;

  // Break tracking
  @Column(DataType.DATE)
  break_start?: Date;

  @Column(DataType.STRING(100))
  break_reason?: string;

  @Default(0)
  @Column(DataType.INTEGER)
  total_break_time!: number;

  // Capacity
  @Default(1)
  @Column(DataType.INTEGER)
  max_concurrent_calls!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  current_concurrent_calls!: number;

  // Queue settings
  @Default([])
  @Column(DataType.JSONB)
  queue_priorities!: string[];

  @Default([])
  @Column(DataType.JSONB)
  skills!: string[];

  // Stats
  @Default(0)
  @Column(DataType.INTEGER)
  total_idle_time!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  total_wrap_time!: number;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: Record<string, any>;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Associations
  @BelongsTo(() => User)
  user!: User;

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => Call, 'current_call_id')
  current_call?: Call;

  @HasMany(() => Call, 'agent_session_id')
  calls!: Call[];

  // Methods
  async endSession(): Promise<void> {
    this.ended_at = new Date();
    this.is_online = false;
    this.status = AgentStatus.OFFLINE;
    await this.save();
  }

  async updateActivity(): Promise<void> {
    this.last_activity = new Date();
    await this.save();
  }

  async setStatus(status: AgentStatus, reason?: string): Promise<void> {
    const previousStatus = this.status;
    this.status = status;
    this.last_activity = new Date();
    
    // Handle break time tracking
    if (status === AgentStatus.AWAY && !this.break_start) {
      this.break_start = new Date();
      if (reason) this.break_reason = reason;
    } else if (status !== AgentStatus.AWAY && this.break_start) {
      const breakDuration = Math.floor((new Date().getTime() - this.break_start.getTime()) / 1000);
      this.total_break_time += breakDuration;
      this.break_start = undefined;
      this.break_reason = undefined;
    }
    
    await this.save();
  }

  canHandleMoreCalls(): boolean {
    return this.current_concurrent_calls < this.max_concurrent_calls &&
           this.status === AgentStatus.AVAILABLE &&
           this.is_online;
  }
}