# Hệ thống Quản lý Điểm và Hồ sơ Quân nhân Đại đội 460

Dự án Web Application phục vụ công tác quản lý điểm số (theo Năm học từ Năm 1 đến Năm 5), tính điểm tích lũy toàn khóa, quản lý chuẩn ngoại ngữ và hồ sơ trích ngang quân nhân tại **Đại đội 460 - Tiểu đoàn 4 - Học viện Kỹ thuật Quân sự**.

## 1. Hệ thống Tài khoản & Phân quyền (RBAC)

Giao diện đăng nhập được chia thành 4 nhóm tài khoản cố định (đã xóa bỏ hoàn toàn chức năng cấp quyền):

1. **Tài khoản Admin:**
   - Tên đăng nhập: `huudung` | Mật khẩu: `hd304`
   - Quyền hạn: Toàn quyền quản lý hệ thống, cấu hình chuẩn ngoại ngữ, khóa sổ điểm, xem/nhập điểm từng lớp hoặc toàn bộ đại đội.
2. **Tài khoản Cán bộ Đại đội:**
   - Tên đăng nhập: `canbo` | Mật khẩu: `canbon460`
   - Quyền hạn: Toàn quyền quản lý, nhập điểm, cấu hình chuẩn ngoại ngữ, và có tính năng **xem toàn bộ đại đội (tất cả 5 lớp)** hoặc từng lớp riêng lẻ.
3. **5 Tài khoản Lớp (`OTQS1`, `OTQS2`, `TTG1`, `TTG2`, `XMCB`):**
   - Tên đăng nhập: `otqs1`, `otqs2`, `ttg1`, `ttg2`, `xmcb`
   - Mật khẩu theo cấu trúc `[tên_lớp]a@`: `otqs1a@`, `otqs2a@`, `ttg1a@`, `ttg2a@`, `xmcba@`
   - Quyền hạn: Phạm vi dữ liệu bị cô lập tuyệt đối chỉ trong lớp mình phụ trách (chỉ xem và sửa dữ liệu, môn học, trình độ ngoại ngữ của lớp mình).
4. **Tài khoản Học viên:**
   - Đăng nhập bằng **Mã Học Viên** (VD: `HV2022-0101`).
   - Quyền hạn: Chỉ xem bảng điểm cá nhân (cuộn dọc từ Năm 1 đến Năm 5), xuất file cá nhân `Bảng điểm(thông tin cá nhân) - [Họ và tên học viên].xlsx`, và xem/chỉnh sửa trực tiếp Hồ sơ Quân nhân của chính mình (`[ Chỉnh sửa ] / [ Lưu ]`).

## 2. Quản lý Trình độ Ngoại ngữ (Chuẩn đạt & Thực tế)
- **Thiết lập chuẩn ngoại ngữ (Admin & Cán bộ):** Cấu hình trực tiếp chuẩn ngoại ngữ hiện tại phải đạt được theo tiến độ đào tạo (`A1.1`, `A1`, `A2.1`, `A2`, `A2.2`, `B1.1`, `B1`, `B1.2`, `B2`).
- **Cập nhật & Đánh giá trình độ (Admin, Cán bộ & Tài khoản Lớp):** Chọn trình độ ngoại ngữ thực tế mà học viên đã đạt được; hệ thống tự động so sánh với chuẩn hiện tại và hiển thị rõ trạng thái **"Chưa đạt"** nếu học viên chưa đạt chuẩn yêu cầu.

## 3. Cấu trúc ứng dụng tĩnh + Netlify
```text
├── index.html                 # Trang chính, tải module từ src/
├── src/
│   ├── css/main.css
│   └── js/                    # supabase, grades, students, auth, main
├── scripts/build.mjs          # Tạo bản triển khai sạch
├── tests/                     # Kiểm thử hồi quy và trình duyệt
├── supabase_schema.sql        # SQL chạy riêng trong Supabase SQL Editor
├── package.json
└── netlify.toml
```

## Phát triển và kiểm thử luồng nhập Excel

- Chạy `npm test` (Node.js 18 trở lên) để kiểm tra nhập điểm, lỗi ghi từng lô, phân trang và đồng bộ Realtime. Các bài kiểm thử dùng API giả lập, không sửa dữ liệu Supabase thật.
- Chạy `npm run build` để tạo lại thư mục `dist/`, chỉ gồm `index.html` và `src/`. Netlify tự chạy build và triển khai `dist/`. Sửa JavaScript/CSS trực tiếp trong `src/`, không còn bundle nhúng hoặc bản sao ở thư mục gốc. Khi xem cục bộ cần máy chủ HTTP để tải ES module, không mở HTML qua `file://`.
- Nhập điểm chỉ tạo học viên chưa tồn tại và ghi các ô điểm có trong file; nhập hồ sơ chỉ ghi các học viên trong file. Cột tùy chọn không có trong tiêu đề sẽ không lấy nhầm dữ liệu từ cột khác. Điểm trống hoặc `-` được bỏ qua, điểm không hợp lệ được báo lỗi.
- Nếu Supabase thiếu cột, quá trình nhập dừng với tên bảng/cột cần kiểm tra. Không tự bỏ cột để tiếp tục ghi. Đối chiếu schema thực tế trước khi chạy thay đổi cơ sở dữ liệu.
- Mỗi lô ghi là một yêu cầu riêng, chưa phải giao dịch cho toàn bộ file. Khi lỗi, một số lô trước đó có thể đã lưu; giao diện giữ file để thử lại và khôi phục dữ liệu cục bộ. Upsert theo khóa học viên/môn giúp việc thử lại không tạo thêm bản ghi điểm trùng.
- Hai người sửa cùng một ô điểm vẫn áp dụng lần ghi cuối cùng. Cơ chế phát hiện xung đột/duyệt thay đổi cho cùng một bản ghi cần được triển khai thêm phía cơ sở dữ liệu; không coi các kiểm thử giả lập là kiểm thử tải trên Supabase thật.

Kiểm thử trình duyệt tùy chọn: với máy chủ tĩnh đang chạy ở cổng 3000, chạy `NODE_PATH=/workspace/onboarding-tools/node_modules node tests/browser-import.cjs` nếu Playwright, SheetJS (`xlsx`) và Chromium đã được cài. Kiểm thử mở hai phiên trình duyệt, nhập hai file `.xlsx` đồng thời và kiểm tra các bản ghi đã lưu cùng bảng hiển thị. Toàn bộ dịch vụ bên ngoài được giả lập; kiểm thử không kiểm tra giao diện CSS hay tải thực tế của Supabase.


## Cập nhật database Supabase

Mở **Supabase → SQL Editor → New query**, dán toàn bộ nội dung `supabase_schema.sql` rồi chọn **Run**. Script dành cho schema của ứng dụng với ID dạng TEXT; chưa được chạy trên database thật của bạn.

Script bổ sung bảng/cột còn thiếu, bảo đảm khóa UNIQUE cần cho upsert, thêm năm bảng vào publication `supabase_realtime` nếu publication đó tồn tại, rồi làm mới schema cache. Script giữ nguyên dữ liệu hiện có và cấu hình GRANT/RLS/policy. Chạy lại không tạo thêm chỉ mục UNIQUE trùng chức năng.

Nếu có mã học viên trùng hoặc điểm trùng cặp học viên/môn, PostgreSQL sẽ dừng và rollback toàn bộ script. Giữ nguyên dữ liệu và kiểm tra thông báo lỗi trước khi xử lý; script không tự xóa dòng trùng. Các cột đã bị bỏ qua trong lần nhập trước cần nhập lại từ file gốc sau khi sửa schema.

URL cũ `/quan_ly_diem_dai_doi.html` được Netlify chuyển hướng sang trang chính; các file bản sao đã được xóa. SQL, tài liệu và kiểm thử không nằm trong `dist/`.

## Hiệu năng đọc/ghi dữ liệu

Nhập điểm dùng bảng tra cứu học viên và cache môn học theo cột/lớp trong từng lần nhập, tránh quét lại danh sách cho mọi ô điểm. Cache không được dùng lại giữa các lần nhập. Ghi theo lô tuần tự: tối đa 500 điểm, 200 hồ sơ hoặc 250 môn/chứng chỉ; mỗi payload tối đa 256 KiB tính theo UTF-8. Bản ghi đơn vượt giới hạn được báo lỗi trước khi ghi lô đó. REST dự phòng dùng `return=minimal`, không tải ngược bản ghi vừa ghi.

Đọc điểm chỉ lấy `student_id,subject_id,score`, vẫn phân trang để giữ đủ dữ liệu cho bảng và xuất Excel. Kết quả kiểm thử giả lập: 10.000 điểm dùng 20 yêu cầu ghi thay vì 100 như trước; 1.000 ô cùng môn/lớp chỉ đối chiếu danh mục môn một lần thay vì 1.000 lần. Đây là số yêu cầu/lượt tra cứu, không phải cam kết thời gian trên Supabase thật. Bản tối ưu này không yêu cầu thay đổi schema mới; các khóa upsert vẫn theo `supabase_schema.sql`.
