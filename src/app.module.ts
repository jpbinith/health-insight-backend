import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { IrisRecordsModule } from './modules/iris-records/iris-records.module';
import { createMongooseConfig } from './config/mongoose.config';
import { AnalyseModule } from './modules/analyse/analyse.module';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: createMongooseConfig,
    }),
    UsersModule,
    AuthModule,
    IrisRecordsModule,
    AnalyseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
