// backend/src/models/User.ts
import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  HasMany,
  HasOne,
  Unique,
  AllowNull,
  Default,
  BeforeCreate,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import bcrypt from 'bcryptjs';
import { UserRole } from '../types/enums';
import Company from './Company';
import Call from './Call';
import AgentSession from './AgentSession';
import Tag from './Tag';
import TextMessage from './TextMessage';
import UserInvitation from './UserInvitation';
import Account from './Account';


interface UserPreferences {
  notifications: {
    email: boolean;
    sms: boolean;
    desktop: boolean;
  };
  timezone: string | null;
}

@Table({
  tableName: 'users',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export default class User extends Model<User> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  uuid!: string;

  @ForeignKey(() => Account)
  @Column(DataType.INTEGER)
  account_id?: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(255))
  email!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  password_hash!: string;

  @Column(DataType.STRING(100))
  first_name?: string;

  @Column(DataType.STRING(100))
  last_name?: string;

  @Default(UserRole.USER)
  @Column(DataType.ENUM(...Object.values(UserRole)))
  role!: UserRole;

  @Column(DataType.STRING(20))
  phone?: string;

  @Column(DataType.TEXT)
  personal_note?: string;

  @Column(DataType.STRING(10))
  extension?: string;

  @Unique
  @Column(DataType.STRING(100))
  sip_username?: string;

  @Column(DataType.STRING(255))
  sip_password?: string;

  @Column(DataType.STRING(255))
  sip_realm?: string;

  @Default({
    notifications: {
      email: true,
      sms: false,
      desktop: true
    },
    timezone: null
  })
  @Column(DataType.JSONB)
  preferences!: UserPreferences;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  last_login?: Date;

  @Column(DataType.DATE)
  last_activity?: Date;

  @Column(DataType.INTEGER)
  created_by?: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Associations
  @BelongsTo(() => Account)
  account?: Account;

  @BelongsTo(() => Company)
  company!: Company;

  @HasMany(() => Call, 'agent_id')
  agent_calls!: Call[];

  @HasMany(() => AgentSession)
  sessions!: AgentSession[];

  @HasMany(() => Tag, 'created_by')
  created_tags!: Tag[];

  @HasMany(() => TextMessage, 'agent_id')
  text_messages!: TextMessage[];

  @HasOne(() => UserInvitation, 'user_id')
  invitation?: UserInvitation;

  // Virtual fields
  get full_name(): string {
    return `${this.first_name || ''} ${this.last_name || ''}`.trim();
  }

  get is_online(): boolean {
    return this.sessions?.some(session => !session.ended_at) || false;
  }

  // Methods
  async setPassword(password: string): Promise<void> {
    this.password_hash = await bcrypt.hash(password, 10);
  }

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password_hash);
  }

  // Role checking methods with new structure
  isADMIN(): boolean {
    return this.role === UserRole.ADMIN;
  }

  isManager(): boolean {
    return this.role === UserRole.MANAGER || this.role === UserRole.ADMIN;
  }

  isReporting(): boolean {
    return this.role === UserRole.REPORTING || this.isManager();
  }

  isAgent(): boolean {
    return this.role === UserRole.AGENT || this.isReporting();
  }

  // Permission helpers
  canManageUsers(): boolean {
    return this.isADMIN();
  }

  canManageIntegrations(): boolean {
    return this.isManager();
  }

  canViewReports(): boolean {
    return this.isReporting();
  }

  canPlaceCalls(): boolean {
    return this.isAgent();
  }

  canTagLeads(): boolean {
    return this.isReporting();
  }

  @BeforeCreate
  static async hashPassword(user: User) {
    if (user.password_hash && !user.password_hash.startsWith('$2')) {
      user.password_hash = await bcrypt.hash(user.password_hash, 10);
    }
  }
}