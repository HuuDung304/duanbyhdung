# Nhập Excel: xem trước và giao dịch

Nhập hồ sơ và nhập điểm đều yêu cầu xem trước/xác nhận. Chưa xác nhận hoặc bấm Escape sẽ không gửi dữ liệu. Điểm xem trước gồm mã học viên, tên, lớp, tên môn và điểm. Hồ sơ giữ bảng xem trước đầy đủ đang có. Thiếu mã, trùng mã, sai phạm vi lớp hoặc điểm ngoài 0–10 sẽ chặn bản nhập.

## Bật giao dịch trên Supabase

Chạy nội dung `supabase/migrations/20261029_excel_transaction.sql` trong SQL Editor của đúng dự án. Script không xóa dữ liệu, không đổi RLS hay cơ chế đăng nhập. Hàm SECURITY INVOKER sử dụng quyền bảng và RLS hiện có; đây không phải bản triển khai Supabase Auth/RLS.

Web tự gọi `dd460_import_excel`. Một yêu cầu chứa học viên/môn mới và điểm, hoặc các hồ sơ cập nhật. Lỗi SQL hoàn tác toàn bộ yêu cầu. Không ghi chứng chỉ ngoại ngữ trong nhập hồ sơ. Mã học viên đã tồn tại với ID khác sẽ dừng giao dịch, yêu cầu tải lại dữ liệu, tránh đổi khóa ngoại.

Nếu RPC chưa tồn tại, web hỏi riêng trước khi dùng cách lưu từng đợt cũ; người dùng có thể hủy để cài SQL trước. Các lỗi quyền/SQL/mạng không tự động chuyển sang cách lưu cũ. Các thao tác sửa đơn lẻ vẫn dùng luồng hiện tại.

## Kết quả

- Thành công: tổng số dòng đã lưu, thất bại và bỏ qua (nhập điểm).
- SQL từ chối: 0 dòng thành công, toàn bộ dòng trong giao dịch thất bại.
- Mất kết nối hoặc lỗi giữa các đợt: số dòng thành công chưa xác định; cần tải lại dữ liệu trước khi nhập lại. Không tự động retry giao dịch có kết quả chưa rõ.
- Database đã xác nhận lưu nhưng cập nhật giao diện/nhật ký lỗi: báo đã lưu, không hoàn tác trạng thái hoặc yêu cầu nhập lại.

Giao dịch không ngăn một người sửa đè dữ liệu vừa được người khác sửa: chưa có cơ chế kiểm tra phiên bản tại database. Advisory lock chỉ tuần tự hóa các bản nhập qua RPC này. SQL cần được chủ dự án chạy; chưa triển khai hay kiểm tra trên Supabase thật.

Kiểm thử: `npm test`; `NODE_PATH=/workspace/onboarding-tools/node_modules node tests/excel-transaction.cjs` (PGlite); `NODE_PATH=/workspace/onboarding-tools/node_modules node tests/import-review-browser.cjs` (Playwright, HTTP server ở 3032 hoặc TEST_BASE_URL).
