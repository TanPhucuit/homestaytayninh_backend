import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

function allowedOrigins() {
  const defaults = ["https://homestaytayninh-frontend.vercel.app"];
  const configured = process.env.WEB_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  return Array.from(new Set([...defaults, ...configured]));
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true
  });
  app.setGlobalPrefix("api");
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000);
}

bootstrap();
