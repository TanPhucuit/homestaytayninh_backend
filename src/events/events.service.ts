import { Injectable } from "@nestjs/common";
import { connect, ChannelModel } from "amqplib";

@Injectable()
export class EventsService {
  private connection?: ChannelModel;

  async publish(event: string, payload: unknown): Promise<void> {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      console.info(`[event:${event}]`, payload);
      return;
    }

    try {
      this.connection ??= await connect(url);
      const channel = await this.connection.createChannel();
      await channel.assertExchange("homestay.events", "topic", { durable: true });
      channel.publish("homestay.events", event, Buffer.from(JSON.stringify(payload)), {
        contentType: "application/json",
        persistent: true
      });
      await channel.close();
    } catch {
      console.info(`[event-fallback:${event}]`, payload);
    }
  }
}
