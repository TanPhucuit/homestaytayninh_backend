-- Production presentation data for the Stitch-aligned frontend.
-- Idempotent: only upserts known presentation records, does not delete user data.

insert into public.user_profiles (id, name, email, phone, role, banned)
values
  ('u-customer', 'Minh Anh', 'customer@homestay.vn', '0901000001', 'CUSTOMER', false),
  ('u-owner', 'Chủ Homestay', 'owner@homestay.vn', '0901000002', 'OWNER', false),
  ('u-owner-staff', 'Nhân viên Homestay', 'owner.staff@homestay.vn', '0901000003', 'OWNER_STAFF', false),
  ('u-staff', 'Nhân viên nội dung', 'staff@homestay.vn', '0901000004', 'STAFF', false),
  ('u-admin', 'Quản trị viên', 'admin@homestay.vn', '0901000005', 'ADMIN', false)
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  phone = excluded.phone,
  role = excluded.role,
  banned = excluded.banned,
  "updatedAt" = now();

insert into public.homestays (id, "ownerId", name, type, location, description, "priceFrom", capacity, rating, "imageUrl", latitude, longitude)
values
  ('hs-ba-den', 'u-owner', 'Terra Leaf Núi Bà', 'Nhà nguyên căn', 'Gần Núi Bà Đen, Tây Ninh', 'Căn nhà vườn ấm cúng với view núi, bếp riêng, sân BBQ và khoảng hiên rộng cho nhóm bạn hoặc gia đình nghỉ dưỡng chậm rãi.', 1450000, 8, 4.9, 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85', 11.386, 106.166),
  ('hs-trang-bang', 'u-owner', 'Soft Sand Trảng Bàng', 'Phòng', 'Trảng Bàng, Tây Ninh', 'Phòng nghỉ sáng màu gần làng nghề bánh tráng, phù hợp cho chuyến đi cuối tuần và nhóm nhỏ muốn khám phá ẩm thực địa phương.', 720000, 3, 4.6, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1600&q=85', 11.032, 106.358),
  ('hs-ma-loi', 'u-owner', 'Mã Lòi Forest Retreat', 'Lều', 'Dương Minh Châu, Tây Ninh', 'Khu glamping nằm sát mảng xanh hồ Dầu Tiếng, có lều canvas, bếp lửa tối và dịch vụ trekking nhẹ cho khách thích thiên nhiên.', 980000, 4, 4.7, 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=85', 11.305, 106.297),
  ('hs-go-dau', 'u-owner', 'Gò Dầu Courtyard House', 'Nhà nguyên căn', 'Gò Dầu, Tây Ninh', 'Nhà sân trong phong cách tối giản ấm áp, nhiều ánh sáng tự nhiên, có khu bếp mở và góc đọc sách cho gia đình.', 1250000, 6, 4.8, 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=85', 11.101, 106.257),
  ('hs-long-hoa', 'u-owner', 'Long Hoa Garden Stay', 'Phòng', 'Hòa Thành, Tây Ninh', 'Homestay vườn yên tĩnh gần Tòa Thánh, phù hợp khách nghỉ ngắn ngày, có bữa sáng địa phương và xe máy thuê theo ngày.', 620000, 2, 4.5, 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1600&q=85', 11.287, 106.129)
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  location = excluded.location,
  description = excluded.description,
  "priceFrom" = excluded."priceFrom",
  capacity = excluded.capacity,
  rating = excluded.rating,
  "imageUrl" = excluded."imageUrl",
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  "updatedAt" = now();

insert into public.owner_staff_assignments ("homestayId", "staffId")
values
  ('hs-ba-den', 'u-owner-staff'),
  ('hs-trang-bang', 'u-owner-staff'),
  ('hs-ma-loi', 'u-owner-staff'),
  ('hs-go-dau', 'u-owner-staff'),
  ('hs-long-hoa', 'u-owner-staff')
on conflict ("homestayId", "staffId") do nothing;

insert into public.rooms (id, "homestayId", name, "roomType", "pricePerNight", capacity, "totalUnits", active)
values
  ('room-ba-den-family', 'hs-ba-den', 'Family Garden House', 'Nhà nguyên căn', 1450000, 8, 1, true),
  ('room-ba-den-pine', 'hs-ba-den', 'Pine View Suite', 'Phòng', 920000, 3, 2, true),
  ('room-trang-bang-deluxe', 'hs-trang-bang', 'Deluxe Garden Room', 'Phòng', 720000, 3, 3, true),
  ('room-ma-loi-canvas', 'hs-ma-loi', 'Canvas Tent Lake View', 'Lều', 980000, 4, 4, true),
  ('room-go-dau-house', 'hs-go-dau', 'Courtyard Whole House', 'Nhà nguyên căn', 1250000, 6, 1, true),
  ('room-long-hoa-standard', 'hs-long-hoa', 'Garden Standard Room', 'Phòng', 620000, 2, 4, true)
on conflict (id) do update set
  name = excluded.name,
  "roomType" = excluded."roomType",
  "pricePerNight" = excluded."pricePerNight",
  capacity = excluded.capacity,
  "totalUnits" = excluded."totalUnits",
  active = excluded.active,
  "updatedAt" = now();

insert into public.amenities ("homestayId", name)
values
  ('hs-ba-den', 'Wifi'), ('hs-ba-den', 'Bếp riêng'), ('hs-ba-den', 'Sân BBQ'), ('hs-ba-den', 'View núi'), ('hs-ba-den', 'Bãi đậu xe'), ('hs-ba-den', 'Máy lạnh'),
  ('hs-trang-bang', 'Wifi'), ('hs-trang-bang', 'Máy lạnh'), ('hs-trang-bang', 'Bãi đậu xe'), ('hs-trang-bang', 'Gần chợ địa phương'),
  ('hs-ma-loi', 'Lửa trại'), ('hs-ma-loi', 'Hồ Dầu Tiếng'), ('hs-ma-loi', 'BBQ'), ('hs-ma-loi', 'Trekking'),
  ('hs-go-dau', 'Sân trong'), ('hs-go-dau', 'Bếp mở'), ('hs-go-dau', 'Máy giặt'), ('hs-go-dau', 'Không gian làm việc'),
  ('hs-long-hoa', 'Bữa sáng'), ('hs-long-hoa', 'Thuê xe máy'), ('hs-long-hoa', 'Wifi'), ('hs-long-hoa', 'Gần Tòa Thánh')
on conflict ("homestayId", name) do nothing;

insert into public.services (id, "homestayId", name, description, "unitPrice", included, active)
values
  ('svc-breakfast', 'hs-ba-den', 'Bữa sáng bản địa', 'Phục vụ 7:00 - 9:30 hằng ngày', 0, true, true),
  ('svc-wifi', 'hs-ba-den', 'Wifi tốc độ cao', 'Bao gồm trong giá phòng', 0, true, true),
  ('svc-welcome', 'hs-ba-den', 'Nước chào mừng', 'Trà thảo mộc Tây Ninh khi nhận phòng', 0, true, true),
  ('svc-bbq', 'hs-ba-den', 'Tiệc BBQ sân vườn', 'Set BBQ cho 4 người, có bếp và than', 650000, false, true),
  ('svc-trekking', 'hs-ba-den', 'Trekking Núi Bà', 'Hướng dẫn viên nửa ngày', 450000, false, true),
  ('svc-bike-ba-den', 'hs-ba-den', 'Thuê xe máy', 'Xe số theo ngày, kèm mũ bảo hiểm', 180000, false, true),
  ('svc-trang-bang-welcome', 'hs-trang-bang', 'Nước chào mừng', 'Nước thảo mộc địa phương', 0, true, true),
  ('svc-trang-bang-bike', 'hs-trang-bang', 'Thuê xe máy', 'Thuê xe theo ngày', 160000, false, true),
  ('svc-trang-bang-food', 'hs-trang-bang', 'Tour ẩm thực Trảng Bàng', 'Gợi ý và đặt bàn món địa phương', 300000, false, true),
  ('svc-ma-loi-fire', 'hs-ma-loi', 'Lửa trại tối', 'Chuẩn bị củi, bếp lửa và ghế ngoài trời', 280000, false, true),
  ('svc-ma-loi-breakfast', 'hs-ma-loi', 'Bữa sáng glamping', 'Bánh mì, trứng, cà phê và trái cây', 0, true, true),
  ('svc-go-dau-bbq', 'hs-go-dau', 'BBQ sân trong', 'Set BBQ gia đình 4-6 người', 590000, false, true),
  ('svc-go-dau-cleaning', 'hs-go-dau', 'Dọn phòng thêm', 'Dọn phòng giữa kỳ lưu trú', 120000, false, true),
  ('svc-long-hoa-breakfast', 'hs-long-hoa', 'Bữa sáng địa phương', 'Bánh canh, bánh tráng phơi sương hoặc món theo ngày', 0, true, true),
  ('svc-long-hoa-bike', 'hs-long-hoa', 'Thuê xe máy', 'Xe máy theo ngày', 150000, false, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  "unitPrice" = excluded."unitPrice",
  included = excluded.included,
  active = excluded.active;

insert into public.reviews (id, "userId", "homestayId", rating, comment)
values
  ('rev-1', 'u-customer', 'hs-ba-den', 5, 'Không gian xanh, yên tĩnh, sân BBQ rất hợp đi nhóm.'),
  ('rev-2', 'u-customer', 'hs-trang-bang', 4, 'Phòng sạch, gần điểm ăn uống, nhân viên hỗ trợ nhanh.'),
  ('rev-3', 'u-customer', 'hs-ma-loi', 5, 'Lều đẹp, buổi tối lửa trại rất đáng thử.'),
  ('rev-4', 'u-customer', 'hs-go-dau', 5, 'Nhà sân trong ấm, bố cục rất hợp gia đình.'),
  ('rev-5', 'u-customer', 'hs-long-hoa', 4, 'Vị trí tiện, bữa sáng ngon và giá hợp lý.')
on conflict (id) do update set comment = excluded.comment, rating = excluded.rating;

insert into public.bookings (id, "customerId", "homestayId", "roomId", "guestName", "guestPhone", "guestCount", "checkIn", "checkOut", status, "roomTotal", "serviceTotal", "taxTotal", "grandTotal", "proxyCreatedBy")
values
  ('bk-demo-1', 'u-customer', 'hs-ba-den', 'room-ba-den-family', 'Minh Anh', '0901000001', 4, '2026-05-25', '2026-05-27', 'IN_STAY', 2900000, 650000, 177500, 3727500, null),
  ('bk-pending-1', 'u-customer', 'hs-ma-loi', 'room-ma-loi-canvas', 'Minh Anh', '0901000001', 2, '2026-06-02', '2026-06-04', 'PENDING', 1960000, 280000, 112000, 2352000, null),
  ('bk-confirmed-1', 'u-customer', 'hs-go-dau', 'room-go-dau-house', 'Minh Anh', '0901000001', 5, '2026-06-10', '2026-06-12', 'CONFIRMED', 2500000, 590000, 154500, 3244500, null),
  ('bk-completed-1', 'u-customer', 'hs-trang-bang', 'room-trang-bang-deluxe', 'Minh Anh', '0901000001', 2, '2026-05-10', '2026-05-11', 'COMPLETED', 720000, 300000, 51000, 1071000, null),
  ('bk-cancelled-1', 'u-customer', 'hs-long-hoa', 'room-long-hoa-standard', 'Minh Anh', '0901000001', 2, '2026-05-15', '2026-05-16', 'CANCELLED', 620000, 0, 31000, 651000, null),
  ('bk-proxy-1', 'u-customer', 'hs-ba-den', 'room-ba-den-pine', 'Khách gọi điện', '0902222333', 2, '2026-06-15', '2026-06-17', 'CONFIRMED', 1840000, 180000, 101000, 2121000, 'u-owner-staff')
on conflict (id) do update set
  status = excluded.status,
  "roomTotal" = excluded."roomTotal",
  "serviceTotal" = excluded."serviceTotal",
  "taxTotal" = excluded."taxTotal",
  "grandTotal" = excluded."grandTotal",
  "updatedAt" = now();

insert into public.booking_services (id, "bookingId", "serviceId", name, quantity, "unitPrice", total, status)
values
  ('bs-demo-1', 'bk-demo-1', 'svc-bbq', 'Tiệc BBQ sân vườn', 1, 650000, 650000, 'SERVED'),
  ('bs-pending-1', 'bk-pending-1', 'svc-ma-loi-fire', 'Lửa trại tối', 1, 280000, 280000, 'PREPARING'),
  ('bs-confirmed-1', 'bk-confirmed-1', 'svc-go-dau-bbq', 'BBQ sân trong', 1, 590000, 590000, 'PREPARING'),
  ('bs-completed-1', 'bk-completed-1', 'svc-trang-bang-food', 'Tour ẩm thực Trảng Bàng', 1, 300000, 300000, 'SERVED'),
  ('bs-proxy-1', 'bk-proxy-1', 'svc-bike-ba-den', 'Thuê xe máy', 1, 180000, 180000, 'PREPARING')
on conflict (id) do update set status = excluded.status, quantity = excluded.quantity, total = excluded.total;

insert into public.payments (id, "bookingId", provider, "providerRef", status, amount, "checkoutUrl")
values
  ('pay-demo-1', 'bk-demo-1', 'MOCK_APIPAY', 'demo-paid-1', 'PAID', 3727500, 'https://homestaytayninh-frontend.vercel.app/payment/result?status=paid'),
  ('pay-pending-1', 'bk-pending-1', 'MOCK_APIPAY', 'demo-pending-1', 'PENDING', 2352000, 'https://homestaytayninh-frontend.vercel.app/payment/result?status=pending'),
  ('pay-confirmed-1', 'bk-confirmed-1', 'MOCK_APIPAY', 'demo-initiated-1', 'INITIATED', 3244500, 'https://homestaytayninh-frontend.vercel.app/payment/result?status=pending'),
  ('pay-completed-1', 'bk-completed-1', 'MOCK_APIPAY', 'demo-paid-2', 'PAID', 1071000, 'https://homestaytayninh-frontend.vercel.app/payment/result?status=paid'),
  ('pay-cancelled-1', 'bk-cancelled-1', 'MOCK_APIPAY', 'demo-failed-1', 'FAILED', 651000, 'https://homestaytayninh-frontend.vercel.app/payment/result?status=failed'),
  ('pay-proxy-1', 'bk-proxy-1', 'MOCK_APIPAY', 'demo-pending-2', 'PENDING', 2121000, 'https://homestaytayninh-frontend.vercel.app/payment/result?status=pending')
on conflict ("bookingId") do update set
  provider = excluded.provider,
  "providerRef" = excluded."providerRef",
  status = excluded.status,
  amount = excluded.amount,
  "checkoutUrl" = excluded."checkoutUrl",
  "updatedAt" = now();

insert into public.articles (id, "authorId", title, slug, excerpt, content, status)
values
  ('art-1', 'u-staff', 'Khám phá Núi Bà Đen cuối tuần', 'kham-pha-nui-ba-den-cuoi-tuan', 'Lịch trình thư giãn hai ngày một đêm tại Tây Ninh.', 'Gợi ý hành trình, món ngon và nơi lưu trú gần Núi Bà Đen.', 'PUBLISHED'),
  ('art-2', 'u-staff', 'Ăn gì ở Trảng Bàng?', 'an-gi-o-trang-bang', 'Các món địa phương nên thử khi lưu trú tại Trảng Bàng.', 'Bánh tráng phơi sương, bánh canh và các quán ăn gần homestay.', 'PUBLISHED'),
  ('art-3', 'u-staff', 'Checklist đặt homestay cho nhóm bạn', 'checklist-dat-homestay-nhom-ban', 'Những điểm cần kiểm tra trước khi đặt phòng nhóm.', 'Số khách, dịch vụ đi kèm, chính sách hủy và tiện ích bếp nướng.', 'DRAFT')
on conflict (id) do update set
  title = excluded.title,
  slug = excluded.slug,
  excerpt = excluded.excerpt,
  content = excluded.content,
  status = excluded.status,
  "updatedAt" = now();
