import { Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  connectToDatabase,
  disconnectFromDatabase,
} from './config/mongodb.config';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [UsersModule, AuthModule],
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
