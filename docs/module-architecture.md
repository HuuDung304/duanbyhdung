# Cấu trúc module

Ứng dụng tiếp tục chạy bằng HTML và ES modules trên GitHub Pages/Live Server. Không đổi framework, không thêm thư viện runtime, không đổi schema hoặc triển khai SQL trong lần tách này.

## Học tập và báo cáo

- `academic/calculations.js`: ĐTB theo học kỳ/năm/tích lũy, quy đổi thang điểm, xếp loại, tín chỉ đạt và môn nợ.
- `academic/transcript.js`: dựng phiếu điểm cá nhân, kiểm tra phạm vi học viên/lớp và hiển thị các học phần đã có điểm.
- `reports/statistics.js`: tổng hợp số liệu theo phạm vi, năm, học kỳ và bảy mức xếp loại.
- `reports/dashboard.js`: hiển thị báo cáo giao ban và danh sách học viên cần bồi dưỡng.
- `reports/exports.js`: điều phối các mẫu Excel đang có; dùng lại `report-workbook.js`, `class-transcript.js`, `academic-ranking.js` và `dashboard-statistics.js`.

Các module trên cung cấp factory nhận `context` để khai báo phụ thuộc, không import ngược `grades.js`. `grades.js` ghép các dịch vụ, giữ AppState, điều phối màn hình và API cũ cho main/students/auth. Các getter trong context đọc trạng thái hiện tại, kể cả khi luồng đồng bộ thay mảng điểm/học viên hoặc phục hồi bản nhập lỗi. Factory chỉ khởi tạo hàm, không dựng DOM hay lưu database lúc import.

Không tạo bản sao AppState, không đăng ký thêm document event handlers, không thay cơ chế cô lập form đang nhập. Quy tắc điểm và kiểm tra phạm vi giữ nguyên.

## Database

`supabase.js` là facade giữ các named exports và default singleton hiện có. Các triển khai không import ngược facade:

- `database/client.js`: cấu hình, SDK/REST fallback, singleton, retry/timeout và bộ đếm trạng thái ghi.
- `database/mappers.js`: chuyển đổi row database ↔ model ứng dụng, chuẩn hóa ngày và mã học viên.
- `database/batches.js`: chia payload và ghi tuần tự, xử lý xung đột và lỗi schema.
- `database/repository.js`: tải dữ liệu, tìm kiếm và các thao tác CRUD theo bảng.
- `database/realtime.js`: đăng ký thay đổi và đợi các thao tác ghi kết thúc.
- `database/import-transaction.js`: gọi RPC nhập Excel, xử lý kết quả giao dịch.

Repository dùng client/mappers/batches; realtime dùng client; transaction dùng client/mappers. Chỉ có một singleton kết nối và một bộ đếm ghi dùng chung. Không thay endpoint hay khóa kết nối, không thay quyền truy cập.

## Kiểm chứng

`npm test` giữ các ca hồi quy và kiểm tra trực tiếp module tính điểm/thống kê mới. Một số fixture VM cũ dùng `tests/module-source-helper.js` để tìm triển khai sau khi di chuyển. Browser fixture kiểm tra module ES thực tế, các mẫu Excel, phạm vi tài khoản và phiếu điểm.

`npm run build` cập nhật import map phiên bản cho tất cả đường dẫn module mới; runtime vẫn không yêu cầu Node.js.
