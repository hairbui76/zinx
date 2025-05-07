# Các yêu cầu chức năng của hệ thống Zinx Gateway

1. FR1 - Reverse Proxy Nâng cao: Hệ thống phải hoạt động như một reverse proxy hiệu quả cho các ứng dụng web backend, hỗ trợ các tính năng như:
   - Định tuyến dựa trên tên miền và đường dẫn
   - Hỗ trợ cân bằng tải qua cấu hình upstream
   - Kết thúc SSL/TLS với hỗ trợ TLSv1.2 và TLSv1.3
   - Hỗ trợ HTTP/2 và HTTP/3 (QUIC)
   - Hỗ trợ nén Brotli để tối ưu hiệu suất

2. FR2 - Quản lý Chứng chỉ SSL/TLS: Hệ thống phải hỗ trợ việc tạo và quản lý chứng chỉ TLS:
   - Tích hợp với Let's Encrypt hoặc các CA khác thông qua Certbot
   - Hỗ trợ OCSP Stapling
   - Cho phép sử dụng chứng chỉ tùy chỉnh
   - Hỗ trợ nhiều domain trên một chứng chỉ

3. FR3 - Xác thực và Ủy quyền Đa lớp: Hệ thống phải cung cấp nhiều phương thức xác thực:
   - Tích hợp với Keycloak và Authelia cho xác thực người dùng
   - Hỗ trợ Single Sign-On (SSO) qua các ứng dụng được bảo vệ
   - Kiểm soát truy cập dựa trên danh sách (Access Lists)
   - Xác thực HTTP cơ bản
   - Hỗ trợ phân quyền dựa trên vai trò

4. FR4 - Bảo mật Nâng cao: Hệ thống phải bao gồm các tính năng bảo mật tiên tiến:
   - Tích hợp ModSecurity WAF với CoreRuleSet
   - Hỗ trợ CrowdSec IPS để phát hiện và chặn các cuộc tấn công
   - Tích hợp Fail2ban để bảo vệ chống brute-force và giảm thiểu tấn công DDoS cấp độ ứng dụng
   - Header bảo mật tiêu chuẩn và HSTS
   - Tùy chọn tích hợp với openappsec

5. FR5 - Cấu hình và Quản lý: Hệ thống phải cung cấp giao diện quản trị trực quan:
   - Giao diện người dùng dễ sử dụng dựa trên Tabler
   - Hỗ trợ chế độ giao diện tối (Dark Mode)
   - Hỗ trợ đa ngôn ngữ
   - Quản lý người dùng với phân quyền chi tiết
   - Cấu hình Nginx nâng cao cho người dùng chuyên nghiệp

6. FR6 - Giám sát và Ghi log: Hệ thống phải hỗ trợ giám sát và ghi log hiệu quả:
   - Ghi log truy cập thống nhất (tại /opt/npmplus/nginx/access.log)
   - Ghi log lỗi vào console
   - Tích hợp với goaccess để phân tích log
   - Hệ thống nhật ký kiểm toán (audit log) cho hoạt động quản trị

7. FR7 - Tùy biến và Mở rộng: Hệ thống phải có khả năng mở rộng:
   - Hoạt động như một web server với tùy chọn PHP
   - Hỗ trợ fancyindex cho hiển thị thư mục
   - Cấu hình Nginx tùy chỉnh qua giao diện
   - Tùy chọn mở rộng ModSecurity bằng các plugin CoreRuleSet
