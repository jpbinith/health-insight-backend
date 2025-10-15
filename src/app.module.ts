import { Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  connectToDatabase,
  disconnectFromDatabase,
} from './config/mongodb.config';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await connectToDatabase();
  }

  async onModuleDestroy(): Promise<void> {
    await disconnectFromDatabase();
  }
}
