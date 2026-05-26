export type UserRole = "CUSTOMER" | "OWNER" | "OWNER_STAFF" | "STAFF" | "ADMIN";
export type BookingStatus = "PENDING" | "CONFIRMED" | "IN_STAY" | "COMPLETED" | "CANCELLED";
export type ServiceOrderStatus = "PREPARING" | "SERVED";
export type PaymentStatus = "INITIATED" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";
export type ArticleStatus = "DRAFT" | "PUBLISHED";

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  banned: boolean;
}

export interface Homestay {
  id: string;
  ownerId: string;
  name: string;
  type: "Phòng" | "Lều" | "Nhà nguyên căn" | "Phong" | "Leu" | "Nha nguyen can";
  location: string;
  description: string;
  priceFrom: number;
  capacity: number;
  rating: number;
  imageUrl: string;
  amenities: string[];
  includedServices: Service[];
  services: Service[];
  rooms: Room[];
  reviews: Review[];
}

export interface Room {
  id: string;
  homestayId: string;
  name: string;
  roomType: string;
  pricePerNight: number;
  capacity: number;
  totalUnits: number;
  active: boolean;
}

export interface Service {
  id: string;
  homestayId: string;
  name: string;
  description?: string;
  unitPrice: number;
  included: boolean;
  active: boolean;
}

export interface BookingService {
  id: string;
  bookingId: string;
  serviceId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: ServiceOrderStatus;
}

export interface Booking {
  id: string;
  customerId: string;
  homestayId: string;
  roomId: string;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
  roomTotal: number;
  serviceTotal: number;
  taxTotal: number;
  grandTotal: number;
  proxyCreatedBy?: string;
  services: BookingService[];
  payment?: Payment;
  createdAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  provider: string;
  providerRef?: string;
  status: PaymentStatus;
  amount: number;
  checkoutUrl?: string;
}

export interface Article {
  id: string;
  authorId: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: ArticleStatus;
}

export interface ViolationReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
}

export interface Review {
  id: string;
  userId: string;
  rating: number;
  comment: string;
}
