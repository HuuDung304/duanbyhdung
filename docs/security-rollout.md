# Triển khai bảo mật — nhánh security-hardening

Chưa bật bản này trên website chính. Không chạy nhánh này với database cũ chưa nâng cấp: ứng dụng mới cố ý từ chối đăng nhập bằng mật khẩu cố định hoặc chỉ mã học viên.

## Trình tự bắt buộc

1. Sao lưu database và tải một bản các bảng students, subjects, grades, languages, unit_settings. Giữ nguyên `locks.__dd460_ext_profiles` nếu đang có dữ liệu lưu cũ. Dừng nhập liệu trong thời gian chuyển đổi.
2. Trong Supabase SQL Editor, chạy `supabase_schema.sql` nếu chưa cập nhật schema; tiếp theo chạy toàn bộ `supabase/migrations/20261029_security_and_transactions.sql`. Migration có transaction, giữ dữ liệu cũ và thay các policy cũ bằng phân quyền mới. Không chạy lại schema cũ sau khi triển khai nếu chưa kiểm tra tương thích.
3. Tạo file ngoài repository, ví dụ `/duong-dan/accounts.private.json`, chứa mảng tài khoản. Mỗi tài khoản có `username`, `password` riêng tối thiểu 14 ký tự, `role`, `display_name`; lớp có thêm `class_code`, học viên có `student_id` đúng ID trong students. Các role: `admin`, `company_officer`, `class_account`, `student`. Các lớp: OTQS1, OTQS2, TTG1, TTG2, XMCB. Tạo ít nhất một Admin trước. Có thể giữ tên tài khoản cũ, nhưng phải đổi toàn bộ mật khẩu cũ đã lộ trong mã nguồn.
4. Trên máy quản trị, đặt biến môi trường `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` (không đặt vào website, GitHub hay ảnh chụp), chạy `node scripts/provision-accounts.mjs /duong-dan/accounts.private.json`. Script không gửi email, không in mật khẩu và không đổi mật khẩu tài khoản đã tồn tại trừ khi dùng `--reset-passwords`. Xóa biến khóa quản trị khỏi phiên terminal sau khi dùng. File riêng cần quyền đọc hạn chế.
5. Tắt đăng ký công khai tại Supabase Auth. Tài khoản đăng nhập bằng username được ánh xạ tới email nội bộ `username@dd460.invalid`. Đây là định danh đăng nhập, không phải hòm thư khôi phục. Học viên phải nhập mã và mật khẩu được cấp. Việc đổi/quên mật khẩu do quản trị xử lý qua Supabase Admin; không thể gửi email tới miền nội bộ này.
6. Chạy `npm ci`, `npm run check`, `npm test`, `npm run build`, rồi kiểm tra browser bằng cấu hình Auth thử nghiệm. Kiểm tra thực tế từng vai trò trên một bản preview với database thử nghiệm trước khi hợp nhất nhánh vào main.
7. Sau khi xác nhận: hợp nhất nhánh vào main để GitHub Pages phục vụ bản mới. Đăng nhập thử Admin, cán bộ, một lớp và một học viên. Không phục hồi policy cho anon hoặc bật lại đăng nhập cũ nếu có lỗi; sửa cấu hình/tài khoản trước.

## Hành vi mới

- Phiên được xác thực bởi Supabase Auth; role không lấy từ sessionStorage. JWT được gắn vào cả SDK và REST fallback. Không đọc dữ liệu trước đăng nhập.
- RLS đọc: Admin/cán bộ toàn đơn vị, lớp chỉ lớp mình, học viên chỉ bản thân. Cán bộ không ghi. Học viên không sửa điểm, lớp không sửa danh mục môn hoặc chuyển hồ sơ sang lớp khác.
- Mọi ghi qua RPC được kiểm tra quyền và revision. Thấy thông báo xung đột thì tải lại và đối chiếu; không tự ghi đè.
- Nhập điểm gồm học viên/môn/điểm trong một transaction. Có lỗi thì rollback toàn bộ. Request có mã idempotency để thử lại lỗi mạng không ghi hai lần.
- Nhật ký do trigger database tạo, ghi actor/time/trước/sau. Client không được sửa/xóa nhật ký. Nhật ký cũ trong unit_settings giữ lại làm lưu trữ, không tiếp tục bị ghi đè.
- Cấu hình chỉ cập nhật các khóa thay đổi và so sánh phiên bản giá trị; không ghi đè toàn bộ locks hay dữ liệu lưu cũ. Dữ liệu lưu cũ không được trả cho tài khoản lớp/học viên.

## Giới hạn cần quản trị

RLS chỉ có tác dụng sau khi SQL thực sự được chạy. Chưa xác nhận cấu hình database thật trong phiên làm việc này. Cần thiết lập sao lưu/PITR theo gói Supabase; chưa thử tải 70–80 người dùng trên production. Định kỳ lưu trữ và dọn write_receipts bằng tác vụ quản trị sau thời gian giữ phù hợp (ví dụ 30 ngày); không cấp quyền xóa cho client. Service-role luôn là quyền quản trị, tuyệt đối không gửi tới trình duyệt.
