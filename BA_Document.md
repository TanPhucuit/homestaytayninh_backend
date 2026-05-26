# TÀI LIỆU PHÂN TÍCH NGHIỆP VỤ
(BUSINESS REQUIREMENTS DOCUMENT)
Dự án: Hệ thống Website Đặt phòng Homestay Tây Ninh
Ngày lập: 25/05/2026
# 1. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)
## 1.1. Mục tiêu dự án
Dự án "Homestay Tây Ninh" được xây dựng nhằm cung cấp một nền tảng website toàn diện phục vụ cho việc tìm kiếm, đặt phòng và quản lý dịch vụ lưu trú tại khu vực Tây Ninh. Hệ thống hướng tới việc số hóa quy trình vận hành homestay, kết nối trực tiếp giữa khách du lịch và các chủ cơ sở lưu trú, đồng thời cung cấp công cụ quản lý mạnh mẽ cho đội ngũ vận hành.
## 1.2. Phạm vi dự án
Hệ thống bao gồm các phân hệ chính:
Phân hệ Khách hàng (Customer Portal): Tìm kiếm, xem chi tiết, đặt phòng, đặt dịch vụ và quản lý lịch sử giao dịch.
Phân hệ Quản lý Homestay (Owner/Owner Staff Portal): Quản lý thông tin phòng, tiếp nhận và xử lý đơn đặt phòng, đặt dịch vụ hộ khách hàng.
Phân hệ Quản trị Hệ thống (Admin/Staff Portal): Quản lý tài khoản, phân quyền, kiểm duyệt nội dung và theo dõi báo cáo tổng thể.
# 2. PHÂN QUYỀN NGƯỜI DÙNG (USER ROLES & PERMISSIONS)
Hệ thống được thiết kế với 5 vai trò người dùng riêng biệt, đảm bảo tính bảo mật và chuyên biệt hóa trong quá trình vận hành.
# 3. YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS)
## 3.1. Phân hệ Khách hàng (Customer)
Phân hệ này tập trung vào trải nghiệm người dùng (UX) mượt mà, giúp khách hàng dễ dàng tìm kiếm và hoàn tất giao dịch.
Đăng nhập/Đăng ký bằng Google (Google Login/Signup): Khách hàng có thể đăng nhập hoặc đăng ký tài khoản nhanh chóng thông qua tài khoản Google hiện có, giúp giảm thiểu rào cản đăng ký và tăng trải nghiệm người dùng.
Tìm kiếm & Lọc: Khách hàng có thể tìm kiếm homestay theo ngày nhận/trả phòng, số lượng khách. Hệ thống hỗ trợ bộ lọc chi tiết theo loại hình (Phòng, Lều, Nhà nguyên căn), mức giá và tiện ích đi kèm.
Chi tiết Homestay: Hiển thị đầy đủ thông tin bao gồm hình ảnh chất lượng cao, mô tả chi tiết, danh sách tiện ích, vị trí trên bản đồ và các đánh giá từ người dùng trước.
Đặt phòng (Booking): Quy trình đặt phòng tối giản, cho phép khách hàng nhập thông tin cá nhân, chọn phương thức thanh toán và xác nhận đơn hàng.
Tích hợp ApiPay (ApiPay Integration): Hệ thống tích hợp cổng thanh toán ApiPay, cho phép khách hàng thực hiện thanh toán trực tuyến an toàn và tiện lợi cho các đơn đặt phòng và dịch vụ bổ sung.
Đặt dịch vụ bổ sung (Service Order): Khách hàng có thể đặt thêm các dịch vụ tại chỗ (ví dụ: Tiệc BBQ sân vườn, Trekking, Bữa sáng, Nước uống) ngay trong lúc đặt phòng hoặc sau khi đã nhận phòng.
Quản lý Đơn hàng: Khách hàng có thể theo dõi trạng thái các đơn đặt phòng của mình, được phân loại rõ ràng: Sắp tới, Đang trải nghiệm, Đã hoàn thành, Đã hủy.
## 3.2. Phân hệ Chủ Homestay & Nhân viên (Owner & Owner Staff)
Cung cấp công cụ quản lý nghiệp vụ hàng ngày tại cơ sở lưu trú.
Quản lý Thông tin (Owner): Thêm mới, chỉnh sửa hoặc xóa thông tin phòng, cập nhật giá theo thời điểm, quản lý hình ảnh và danh sách dịch vụ đi kèm.
Quản lý Booking (Owner Staff): Giao diện theo dõi toàn bộ đơn đặt phòng. Cho phép tiếp nhận, xác nhận hoặc từ chối đơn hàng dựa trên tình trạng phòng thực tế.
Đặt hộ khách hàng (Proxy Booking): Chức năng đặc biệt dành cho Owner Staff. Trong trường hợp khách hàng không biết sử dụng hệ thống hoặc gọi điện trực tiếp, nhân viên có thể tạo đơn đặt phòng và gọi dịch vụ hộ khách hàng ngay trên hệ thống.
Cập nhật Trạng thái: Owner Staff chịu trách nhiệm cập nhật trạng thái thực tế của đơn hàng (Check-in, Check-out) để hệ thống đồng bộ dữ liệu.
## 3.3. Phân hệ Quản trị & Vận hành (Admin & Staff)
Đảm bảo hệ thống hoạt động ổn định và nội dung được kiểm soát.
Quản lý Nội dung (Staff): Hệ thống CMS (Content Management System) cho phép soạn thảo, định dạng và xuất bản các bài viết quảng bá du lịch, cẩm nang Tây Ninh.
Kiểm soát Người dùng (Staff): Theo dõi hoạt động của người dùng, tiếp nhận báo cáo vi phạm và thực hiện khóa (ban) tài khoản khi cần thiết.
Quản lý Tài khoản (Admin): Khởi tạo và phân quyền cho các tài khoản đối tác (Owner, Owner Staff) và nhân viên nội bộ (Staff).
Báo cáo Thống kê (Admin): Bảng điều khiển (Dashboard) tổng hợp dữ liệu về số lượng giao dịch, doanh thu tổng, tỷ lệ lấp đầy phòng và hiệu suất của từng homestay.
# 4. HIỂN THỊ DỊCH VỤ KÈM THEO TRONG BOOKING (BOOKING SERVICES DISPLAY)
Phần này mô tả cách thức hệ thống hiển thị và quản lý các dịch vụ đi kèm trong một đơn đặt phòng (Booking).
## 4.1. Cấu trúc hiển thị trong Chi tiết Đơn hàng
Trong giao diện chi tiết của một đơn đặt phòng (dành cho cả Customer và Owner Staff), các dịch vụ được phân loại và hiển thị như sau:
Dịch vụ đã bao gồm (Included Services): Hiển thị các dịch vụ mặc định đi kèm với giá phòng (ví dụ: Bữa sáng, Nước chào mừng, Wifi).
Dịch vụ đặt thêm (Add-on Services): Danh sách các dịch vụ khách hàng đã chọn thêm (ví dụ: BBQ sân vườn, Thuê xe máy, Trekking). Mỗi dịch vụ bao gồm: Tên dịch vụ, Số lượng, Đơn giá, Thành tiền.
Tổng cộng (Order Summary): Tiền phòng, Tổng tiền dịch vụ, Thuế/Phí (nếu có), Tổng hóa đơn (Grand Total).
## 4.2. Tính năng tương tác với dịch vụ
Thêm dịch vụ mới: Nút "Thêm dịch vụ" luôn hiển thị khi đơn hàng ở trạng thái Đang trải nghiệm (In-stay) để Owner Staff có thể gọi thêm dịch vụ hộ khách.
Xác nhận dịch vụ: Các dịch vụ sau khi được gọi sẽ có trạng thái riêng (Ví dụ: Đang chuẩn bị, Đã phục vụ) để nhân viên dễ dàng quản lý.
# 5. QUY TRÌNH NGHIỆP VỤ (BUSINESS WORKFLOWS)
## 5.1. Luồng Trạng thái Đơn Đặt Phòng (Booking State Machine)
## 1. Chờ xác nhận (Pending): Trạng thái khởi tạo ngay khi Customer hoàn tất yêu cầu đặt phòng.
## 2. Đã xác nhận (Confirmed): Owner Staff kiểm tra tình trạng phòng và xác nhận đơn hàng.
## 3. Đang trải nghiệm (In-stay): Trạng thái được cập nhật khi Customer đến nhận phòng (Check-in).
## 4. Đã hoàn thành (Completed): Trạng thái cuối cùng sau khi Customer trả phòng (Check-out) và hoàn tất thanh toán.
## 5. Đã hủy (Cancelled): Đơn hàng có thể bị hủy bởi Customer hoặc Owner Staff.
## 5.2. Luồng Đặt Dịch Vụ Hộ (Proxy Service Ordering)
## 1. Customer yêu cầu dịch vụ trực tiếp với nhân viên.
## 2. Owner Staff đăng nhập hệ thống, tìm kiếm đơn đặt phòng đang ở trạng thái Đang trải nghiệm (In-stay).
## 3. Owner Staff chọn chức năng "Thêm dịch vụ", chọn món và số lượng.
## 4. Hệ thống tự động ghi nhận chi phí vào tổng hóa đơn của phòng đó.
# 6. YÊU CẦU GIAO DIỆN & TRẢI NGHIỆM (UI/UX GUIDELINES)
Dựa trên tài liệu thiết kế "Terra & Leaf", giao diện hệ thống cần tuân thủ các nguyên tắc sau để mang lại cảm giác ấm cúng, gần gũi với thiên nhiên Tây Ninh.
Link thiết kế mẫu: https://stitch.withgoogle.com/projects/9758983027199050447
Bảng màu (Color Palette): Terracotta (#9a4029), Soft Sand (#fdf9f4), Forest Green (#466550).
Nghệ thuật chữ (Typography): Tiêu đề (Libre Caslon Text), Nội dung (Be Vietnam Pro).
Hình khối & Không gian: Bo tròn góc (12px-16px), phong cách Minimalism.
# 7. YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS)
Khả năng đáp ứng (Responsive Design): Mobile-first.
Hiệu năng (Performance): Phản hồi < 2s.
Bảo mật (Security): SSL, Hash mật khẩu, tuân thủ PCI DSS cho ApiPay.
Tính sẵn sàng (Availability): Uptime 99.9%.