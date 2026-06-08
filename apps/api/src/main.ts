import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { loadEnv, createLogger } from '@ptc/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

const logger = createLogger('api');

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.use(cookieParser());
  app.enableCors({
    origin: env.WEB_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(env.API_PORT);
  logger.info({ port: env.API_PORT }, 'API gestartet');
}

bootstrap().catch((err) => {
  logger.error({ err }, 'API-Start fehlgeschlagen');
  process.exit(1);
});
