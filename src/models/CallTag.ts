// backend/src/models/CallTag.ts
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Default,
  AllowNull,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import Call from './Call';
import Tag from './Tag';
import User from './User';

@Table({
  tableName: 'call_tags',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['call_id', 'tag_id']
    },
    {
      fields: ['call_id']
    },
    {
      fields: ['tag_id']
    }
  ]
})
export default class CallTag extends Model<CallTag> {
  @ForeignKey(() => Call)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  call_id!: number;

  @ForeignKey(() => Tag)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  tag_id!: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  applied_by?: number;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  applied_at!: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  auto_applied!: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Associations
  @BelongsTo(() => Call)
  call!: Call;

  @BelongsTo(() => Tag)
  tag!: Tag;

  @BelongsTo(() => User, 'applied_by')
  appliedByUser?: User;

  // Static methods for bulk operations
  static async bulkAssignTags(
    callIds: number[], 
    tagIds: number[], 
    userId: number
  ): Promise<number> {
    const operations = [];
    const appliedAt = new Date();

    for (const callId of callIds) {
      for (const tagId of tagIds) {
        operations.push({
          call_id: callId,
          tag_id: tagId,
          applied_by: userId,
          applied_at: appliedAt,
          auto_applied: false
        });
      }
    }

    const result = await this.bulkCreate(operations as any, {
      ignoreDuplicates: true,
      returning: false
    });

    return result.length;
  }

  static async bulkRemoveTags(
    callIds: number[], 
    tagIds: number[]
  ): Promise<number> {
    const { Op } = require('sequelize');
    
    return await this.destroy({
      where: {
        call_id: { [Op.in]: callIds },
        tag_id: { [Op.in]: tagIds }
      }
    });
  }
}