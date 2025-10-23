import { Logger } from '@nestjs/common';
import { MongooseModuleOptions } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

export const createMongooseConfig = (): MongooseModuleOptions => {
  const logger = new Logger('MongoDB');
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined');
  }

  const dbName = process.env.MONGODB_DB ?? 'health-insight';

  return {
    uri,
    dbName,
    connectionFactory: (connection: Connection) => {
      if (!connection) {
        logger.warn('Mongoose returned an undefined connection');
        return connection;
      }

      connection.on('connected', () => {
        logger.log(`MongoDB connection established to database "${dbName}"`);
      });

      connection.once('open', () => {
        logger.log('MongoDB is running and ready to accept requests');
      });

      connection.on('error', (error) => {
        logger.error(`MongoDB connection error: ${error}`);
      });

      connection.on('disconnected', () => {
        logger.warn('MongoDB connection has been disconnected');
      });

      if (connection.readyState === 1) {
        logger.log(`MongoDB connection established to database "${dbName}"`);
        logger.log('MongoDB is running and ready to accept requests');
      }

      return connection;
    },
  };
};
