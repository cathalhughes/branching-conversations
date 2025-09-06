import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cors from 'cors';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(bodyParser.json({limit: '50mb'}));
  app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

  app.use(
    cors({
      origin: 'http://localhost:3000',
      credentials: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
