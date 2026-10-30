# Nghiên cứu khoa học

Menu **Nghiên cứu khoa học** có số đề tài, số học viên không trùng, bảng thông tin và nhập tay/Excel. Hai chỉ số dùng cùng phạm vi với bảng.

## Phạm vi và quyền sửa

- Admin/cán bộ: xem toàn đại đội hoặc lọc ngang theo lớp **chủ đề tài**. Danh sách xếp theo lớp của chủ đề tài, rồi tên đề tài. Cán bộ chỉ xem/xuất.
- Tài khoản lớp: không có thanh chọn lớp; xem đề tài có ít nhất một thành viên lớp mình. Được thêm/sửa thông tin đề tài có chủ đề tài thuộc lớp mình và sửa giải thưởng của đề tài được xem.
- Học viên: chỉ thấy đề tài mình tham gia. Được tạo đề tài do mình làm chủ và chỉnh sửa thông tin đề tài mình làm chủ; không được chuyển chủ đề tài hay sửa giải thưởng. Thành viên khác chỉ xem.
- Giải thưởng: Bằng Khen, Giấy Khen và tối đa một trong Loại Xuất sắc/Giỏi/Khá; chỉ Admin/tài khoản lớp được sửa.

Chủ đề tài phải là một học viên thực hiện. Chọn thành viên từ danh sách học viên hiện có, hỗ trợ nhóm nhiều lớp. Đơn vị học viên là lớp/c460/d4; đơn vị cán bộ hướng dẫn nhập riêng. Điểm TBNH được tính theo tín chỉ trong hai học kỳ của năm học chọn trên đề tài, chỉ dùng môn áp dụng cho lớp; chưa có điểm hiển thị `—`.

## Excel

Tải file mẫu trong mục Nghiên cứu khoa học. Mỗi dòng là một đề tài, giữ nguyên tiêu đề:

- Thêm mới: để trống Mã đề tài. Cập nhật: dùng mã từ file **Xuất Excel**. Không đối chiếu/gộp theo tên.
- Thành viên được đối chiếu bằng mã học viên (cột mã nên đặt Text để giữ số 0 đầu). Nhiều mã cách nhau bằng `;`. Mã chủ đề tài luôn được thêm vào thành viên.
- Mỗi cán bộ hướng dẫn một dòng `Họ tên | Đơn vị`. Năm học từ 1–5; nhiều giải thưởng cách nhau bằng `;`.
- Kiểm tra tất cả dòng trước khi cho xác nhận nhập. Hủy xem trước không ghi dữ liệu. Giới hạn 10 MB, 200 đề tài/lần.
- Mỗi đề tài là một lần lưu độc lập. Kết quả hiển thị từng dòng; lỗi một dòng không hoàn tác các dòng đã thành công. Sau lỗi chưa xác nhận, tải lại/đối chiếu trước khi nhập lại để tránh thêm trùng.

## Lưu trữ và đồng thời

Sử dụng JSONB trong bảng `unit_settings` hiện có: mỗi đề tài có một bản ghi `unit_id = research-project:<UUID>`, nội dung ở `locks.research_project` và phiên bản ở `locks.revision`. Không thêm cột/bảng, không dùng localStorage làm nguồn dữ liệu, không sửa bản ghi cấu hình `daidoi460` hay khóa điểm. Tải danh sách có phân trang. Không tạo dữ liệu mẫu trên hệ thống thật.

Khi sửa, đọc lại bản ghi rồi kiểm tra revision; PATCH có điều kiện `locks->>revision`. Nếu người khác đã sửa, báo xung đột và giữ form đang nhập. Mất phản hồi ghi không được tự thử lại. Chuyển tài khoản đóng form và xóa phạm vi/dữ liệu hiển thị cũ.

**Giới hạn xác thực kế thừa:** giống các phần khác của website, tài khoản hiện được xác thực phía frontend bằng khóa Supabase công khai. Module kiểm tra phạm vi và quyền trước khi ghi, nhưng đó không phải cưỡng chế quyền ở database khi ai đó gọi REST trực tiếp. Cần Supabase Auth và RLS theo danh tính thật nếu triển khai bảo vệ phía server; không nhận các tên vai trò do client tự gửi là danh tính tin cậy.

## Kiểm chứng

- `npm test`: phạm vi, chủ đề tài, quyền giải thưởng, Excel và tính TBNH.
- `npm run build`: cập nhật import map và đóng gói `dist/`.
- Máy chủ tĩnh cổng 3000; chạy `NODE_PATH=/workspace/onboarding-tools/node_modules node tests/research-browser.cjs`. REST/CDN đều được giả lập, không ghi Supabase thật. Có thể đặt `RESEARCH_TEST_CSS_PATH` tới CSS Tailwind 3.4.17 biên dịch từ cấu hình trong `index.html` để kiểm tra đầy đủ giao diện khi CDN không truy cập được. Kiểm tra các vai trò, nhóm nhiều lớp, nhập tay/tải lại, xung đột phiên sửa, XSS, màn hình nhỏ, Excel thật, hủy nhập, lỗi một dòng và file xuất.
