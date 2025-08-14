// backend/src/config/database.ts
import { Sequelize } from 'sequelize-typescript';
import path from 'path';

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
    },
    timezone: '-05:00', // EST offset
  },
  timezone: '-05:00', // EST offset,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  models: [path.join(__dirname, '../models')],
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

export default { sequelize };