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
  UpdatedAt,
  Default
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

  // Add these fields to the Account model
@Column(DataType.STRING(50))
plan_type?: string;

@Column(DataType.STRING(50))
subscription_status?: string;

@Column(DataType.STRING(255))
subscription_id?: string;

@Column(DataType.STRING(255))
customer_id?: string;

@Column(DataType.DATE)
trial_ends_at?: Date;

@Column(DataType.DATE)
subscription_ends_at?: Date;

@Default(1000)
@Column(DataType.INTEGER)
monthly_call_limit!: number;

@Default(500)
@Column(DataType.INTEGER)
monthly_text_limit!: number;

@Default(1)
@Column(DataType.INTEGER)
max_companies!: number;

@Default(5)
@Column(DataType.INTEGER)
max_users_per_company!: number;

@Column(DataType.STRING(255))
billing_email?: string;

// Add methods
canCreateCompany(): boolean {
  const companiesCount = this.companies?.length || 0;
  return companiesCount < this.max_companies;
}

getUsageLimits() {
  return {
    calls: this.monthly_call_limit,
    texts: this.monthly_text_limit,
    companies: this.max_companies,
    users_per_company: this.max_users_per_company
  };
}

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