import {
  Table,
  Column,
  Model,
  DataType,
  HasMany,
  Unique,
  AllowNull,
  BeforeCreate,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import bcrypt from 'bcryptjs';
import Company from './Company';
import User from './User';

@Table({
  tableName: 'accounts',
  timestamps: true,
  underscored: true
})
export default class Account extends Model<Account> {

  @Column(DataType.STRING(50))
  subscription_status!: string; // 'trial', 'active', 'past_due', 'cancelled'
  
  @Column(DataType.DATE)
  subscription_ends_at?: Date;
  
  @Column(DataType.JSONB)
  subscription_limits!: {
    max_companies: number;
    max_users_per_company: number;
    max_numbers_per_company: number;
    max_minutes_per_month: number;
  };

  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  uuid!: string;

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

  @Column(DataType.STRING(20))
  phone?: string;

  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  last_login?: Date;

  @CreatedAt
  created_at!: Date;

  @UpdatedAt
  updated_at!: Date;

  @HasMany(() => Company)
  companies!: Company[];

  @HasMany(() => User)
  users!: User[];

  get full_name(): string {
    return `${this.first_name || ''} ${this.last_name || ''}`.trim();
  }

  async setPassword(password: string): Promise<void> {
    this.password_hash = await bcrypt.hash(password, 10);
  }

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password_hash);
  }

  @BeforeCreate
  static async hashPassword(account: Account) {
    if (account.password_hash && !account.password_hash.startsWith('$2')) {
      account.password_hash = await bcrypt.hash(account.password_hash, 10);
    }
  }
}