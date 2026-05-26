import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { CacheModule } from "./cache/cache.module";
import { CmsModule } from "./cms/cms.module";
import { CommonModule } from "./common/common.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { HomestaysModule } from "./homestays/homestays.module";
import { OwnerModule } from "./owner/owner.module";
import { PaymentsModule } from "./payments/payments.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    AuthModule,
    HealthModule,
    CacheModule,
    EventsModule,
    HomestaysModule,
    BookingsModule,
    PaymentsModule,
    OwnerModule,
    AdminModule,
    CmsModule
  ]
})
export class AppModule {}
