# Kết quả học tập trong hồ sơ quân nhân

Tên học viên trong danh sách và trang chi tiết nghiên cứu khoa học mở hồ sơ quân nhân hiện có. Phạm vi xem hồ sơ vẫn theo tài khoản: cá nhân chỉ xem mình, tài khoản lớp chỉ xem lớp mình.

Mục 3 hiển thị toàn bộ môn áp dụng cho lớp, chia 5 năm / 10 học kỳ, gồm cả môn chưa có điểm. Điểm dưới 4 có viền đỏ; ô trống không bị đánh dấu rớt. Có điểm trung bình kỳ, năm và tích lũy cùng số tín chỉ đã đạt.

Admin sửa mọi năm; tài khoản lớp sửa lớp mình khi năm chưa khóa sổ. Cán bộ và học viên xem điểm. Nhập điểm 0–10, hỗ trợ dấu phẩy thập phân; xóa trắng để xóa điểm. Nhấn Enter hoặc rời ô để lưu. Chỉ cập nhật trạng thái sau khi cơ sở dữ liệu xác nhận; lỗi lưu giữ điểm trước đó và hiện thông báo. Không cần thay đổi schema.

Kiểm tra: `npm test`; `tests/cadet-results-browser.cjs` và `tests/research-browser.cjs` chạy Playwright với dữ liệu và API giả lập, không ghi dữ liệu thật.
