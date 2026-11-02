# Kiểm kê và thiết kế lại frontend

## Kiến trúc và ranh giới

Frontend là HTML, CSS, ES modules và `AppState`, chuyển mục bằng `switchTab`, không dùng framework/router. Supabase client/repository đọc và ghi students, subjects, grades, languages, unit_settings; Realtime làm mới dữ liệu. Import Excel có RPC giao dịch và đường dự phòng; các báo cáo Excel/Word tạo ở trình duyệt. Xác thực hiện tại kiểm tra tài khoản phía frontend; các kiểm tra hiển thị không thay thế RLS. Không chạy SQL hay ghi dữ liệu thật trong kiểm thử thiết kế.

| Mục hiện tại | Chức năng cần giữ | Thiết kế/kiểm thử tương ứng |
|---|---|---|
| Tổng quan | KPI, ngoại ngữ, lọc lớp, báo cáo | KPI theo phạm vi, phân cấp rõ; kiểm tra số và quyền |
| Bảng điểm | lọc lớp/năm, tìm, sửa điểm, khóa, nhập Excel | bảng cuộn và hộp bảng hiện có; giữ focus, thứ tự phím và xác nhận nhập |
| Hồ sơ quân nhân | tìm/lọc, thêm/sửa/xóa, hồ sơ cá nhân, nhập Excel | thông tin và thao tác có phân cấp; kiểm tra phạm vi và form |
| Tiếng Nga · Tích lũy | trình độ, chuẩn, điểm tích lũy, phiếu điểm | bảng và bộ lọc hiện có; không thay chuẩn hoặc công thức |
| Toàn đại đội | lọc lớp/năm, kết quả, phiếu điểm | bảng theo phạm vi Admin/cán bộ; lớp bị giới hạn như cũ |
| Nghiên cứu khoa học | đề tài, thành viên, giải thưởng, nhập/xuất | biểu mẫu, danh sách và quyền hiện có |
| Xuất báo cáo | các file Excel/Word, danh hiệu, học bổng, tranh thủ | thẻ và hộp nhập thống nhất; kiểm tra file thực từ fixture |
| Nhật ký | xem, lọc theo lớp, xóa được xác nhận | bảng/sự kiện và quyền xóa Admin giữ nguyên |
| Môn học | danh mục theo lớp/kỳ, tín chỉ, thêm/sửa | giữ ID môn, điểm và kiểm tra quyền |
| Cài đặt hiển thị | sáng/tối, sở thích cá nhân | thay đổi cục bộ, không ghi database |

## Sơ đồ và trình tự

Điều hướng theo nhóm: **Tổng quan**, **Quản lý học tập** (bảng điểm, hồ sơ, tiếng Nga/tích lũy, toàn đại đội), **Nghiên cứu & báo cáo**, **Quản trị** (nhật ký, môn học). Các nút và kiểm tra quyền cũ vẫn là nguồn hành vi; tiêu đề nhóm ẩn khi không còn mục được phép. Màn hình không tự tạo nghiệp vụ hàng loạt, dữ liệu giả hay rèn luyện không có nguồn.

Trình tự: (1) hệ token, shell và điều hướng; (2) bề mặt dữ liệu, form, bảng và trạng thái; (3) xác minh theo các luồng nghiệp vụ và quyền. Dùng nút/đầu vào hiện có, không clone form hoặc thay API. Kiểm tra tối thiểu 1920, 1366, 768, 375 px; bàn phím, tương phản, reduced motion, dữ liệu trống, các vai trò, nhập/xuất và lỗi runtime. Kiểm thử fixture không chứng minh CRUD, tải hay quyền phía server thật; các phần chưa được kiểm tra phải được ghi riêng.
