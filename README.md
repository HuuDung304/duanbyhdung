# Hệ thống Quản lý Điểm và Hồ sơ Quân nhân Đại đội 460

Dự án Web Application phục vụ công tác quản lý điểm số (theo Năm học từ Năm 1 đến Năm 5), tính điểm tích lũy toàn khóa, quản lý chuẩn ngoại ngữ và hồ sơ trích ngang quân nhân tại **Đại đội 460 - Tiểu đoàn 4 - Học viện Kỹ thuật Quân sự**.

## Giao diện Bento Dashboard

Giao diện mới gồm sidebar cố định, thanh tìm kiếm theo quyền tài khoản, thao tác nhanh, thẻ KPI theo toàn khóa/năm/học kỳ, biểu đồ 10 học kỳ, học phần cần bồi dưỡng và nhật ký. Dashboard dùng dữ liệu thật; khi chưa có điểm sẽ hiển thị trạng thái trống. Tài khoản học viên vẫn vào bảng điểm cá nhân; cán bộ và tài khoản lớp vào Dashboard theo phạm vi được xem.

Mã giao diện nằm trong `src/css/bento-dashboard.css` và `src/js/components/bento-dashboard.js`; các bảng, form, ID và hàm lưu dữ liệu hiện có được giữ lại. Việc làm mới Dashboard đi qua hook hiển thị và tôn trọng trạng thái đang chỉnh sửa. Không cần thay đổi SQL cho lần thiết kế giao diện này.

Chạy trực tiếp `index.html` qua **Live Server** hoặc GitHub Pages, không mở bằng `file://` vì ứng dụng dùng ES modules. Toàn bộ URL ứng dụng là tương đối và dùng được trong đường dẫn `/duanbyhdung/`. Các thư viện CDN cần kết nối Internet. Nếu Chart.js không tải được, Dashboard vẫn có biểu đồ cột dự phòng cùng dữ liệu đọc được bằng trình đọc màn hình.

`npm run build` là bước đóng gói tùy chọn: cập nhật mã phiên bản theo nội dung CSS/JS trong `index.html` rồi sao chép sang `dist/`. File HTML đã lưu sẵn các URL này để GitHub Pages có thể phục vụ nhánh `main` trực tiếp; import map đảm bảo các module cùng dùng một AppState. Sau khi sửa CSS/JS, chạy lại lệnh này trước khi push để cập nhật phiên bản tài nguyên.

Kiểm tra giao diện bằng `tests/bento-browser.cjs` và `tests/rail-browser.cjs` với Playwright/Chromium; đặt `TEST_BASE_URL` tới máy chủ tĩnh. Dữ liệu Supabase trong các kiểm thử này được giả lập, không ghi lên hệ thống thật. Có thể đặt `BENTO_TEST_CSS_PATH` tới CSS Tailwind biên dịch cục bộ và `BENTO_CHART_JS_PATH` tới bản Chart.js 4.4.1 để kiểm tra khi CDN không truy cập được từ trình duyệt.

## Quản trị tập trung và Báo cáo giao ban

Các thao tác xóa toàn bộ học viên, môn học và nhật ký chỉ nằm tại **Cài đặt → Quản trị dữ liệu**, chỉ Admin được dùng. Hộp thoại yêu cầu nhập đúng `XÓA HỌC VIÊN`, `XÓA MÔN HỌC` hoặc `XÓA NHẬT KÝ`; nút xác nhận bị khóa nếu nhập sai. Hủy/nhấn Escape không gửi yêu cầu xóa. Với học viên và môn học, màn hình chỉ xóa dữ liệu sau khi database xác nhận thành công.

Hồ sơ chỉ có một nút **Nhập Excel Hồ Sơ**, vẫn đối chiếu theo mã học viên. Các nút thêm học viên/môn học ở bảng điểm, xóa cả học kỳ, cập nhật chứng chỉ thủ công ở thanh công cụ, logo và đổi tài khoản đã được bỏ. Đăng xuất vẫn hoạt động. Cài đặt hiển thị tổng số môn và tín chỉ hiện có của từng lớp, bao gồm đúng các môn chung/chuyên ngành áp dụng cho lớp đó; tài khoản lớp chỉ xem thẻ lớp mình.

**Riêng Báo cáo giao ban** sử dụng 5 mức: Xuất sắc ≥ 8,50; Giỏi từ 8,00 đến dưới 8,50; Khá từ 7,00 đến dưới 8,00; Trung bình từ 5,00 đến dưới 7,00; Yếu dưới 5,00. Quy tắc 7 mức ở bảng điểm/tích lũy được giữ nguyên. Môn dưới 4,00 mới tính rớt, điểm trống không tính rớt. Báo cáo có KPI toàn khóa, ma trận 5 năm/10 học kỳ, danh sách nợ môn đầy đủ tên môn và nút phiếu điểm cá nhân. Tài khoản lớp bị khóa phạm vi; học viên không được xuất báo cáo.

File Excel gồm 3 sheet: tổng hợp đủ ba bảng, chi tiết từng năm/học kỳ, danh sách học viên rớt kèm phụ lục từng môn. `src/js/report-workbook.js` bổ sung thiết lập OOXML A4 ngang, lề in, vùng in và vừa một trang ngang vì SheetJS CE không tự ghi `pageSetup`. Có thể kiểm tra toàn bộ luồng với `tests/admin-report-browser.cjs`, dùng database giả lập.

## Phạm vi Tổng quan và thống kê ngoại ngữ

Với Admin/cán bộ, bốn khối Bento (bức tranh tổng quan, học phần cần bồi dưỡng, nhịp hoạt động, hành trình học kỳ) được bỏ khỏi màn hình Tổng quan. KPI luôn tính toàn bộ quân số đại đội; tài khoản lớp chỉ tính lớp mình. Bộ lọc lớp vẫn dùng cho ba bảng báo cáo chi tiết, không thu hẹp KPI hay bảng thống kê ngoại ngữ.

Bảng ngoại ngữ có 5 hàng theo 5 lớp cho Admin/cán bộ và 1 hàng cho tài khoản lớp. Mỗi hàng có quân số, số lượng/tỷ lệ đạt và chưa đạt; mẫu số là quân số của chính lớp đó. Lớp trống hiển thị 0,0%, không chia cho 0. Chỉ Admin được thay chuẩn; mọi số liệu và file xuất sử dụng chuẩn đang chọn, trình độ thiếu/không hợp lệ tính chưa đạt.

**Xuất thống kê ngoại ngữ** gồm sheet tổng hợp theo lớp và danh sách học viên. Danh sách xếp tất cả học viên đạt lên trước, rồi đến chưa đạt, với mã, họ tên, năm sinh, lớp, trình độ hiện tại và trạng thái. **Xuất học viên rớt môn** nằm trong thẻ KPI rớt môn, có mã, họ tên, năm sinh, lớp, tên đầy đủ từng môn rớt (tín chỉ) và tổng tín chỉ chỉ của các môn rớt. Chỉ điểm dưới 4,00 tính rớt; 4,00 và điểm trống không tính rớt. Các file xuất theo toàn phạm vi tài khoản và không ghi dữ liệu lên database.

## 1. Hệ thống Tài khoản & Phân quyền (RBAC)

Giao diện đăng nhập được chia thành 4 nhóm tài khoản cố định (đã xóa bỏ hoàn toàn chức năng cấp quyền):

1. **Tài khoản Admin:**
   - Tên đăng nhập: `huudung` | Mật khẩu: `hd304`
   - Quyền hạn: Toàn quyền quản lý hệ thống, cấu hình chuẩn ngoại ngữ, khóa sổ điểm, xem/nhập điểm từng lớp hoặc toàn bộ đại đội.
2. **Tài khoản Cán bộ Đại đội:**
   - Tên đăng nhập: `canbo` | Mật khẩu: `canbon460`
   - Quyền hạn: Chỉ xem, lọc và xuất dữ liệu; không nhập/sửa/xóa hoặc cấu hình chuẩn ngoại ngữ. Có tính năng **xem toàn bộ đại đội (tất cả 5 lớp)** hoặc từng lớp riêng lẻ.
3. **5 Tài khoản Lớp (`OTQS1`, `OTQS2`, `TTG1`, `TTG2`, `XMCB`):**
   - Tên đăng nhập: `otqs1`, `otqs2`, `ttg1`, `ttg2`, `xmcb`
   - Mật khẩu theo cấu trúc `[tên_lớp]a@`: `otqs1a@`, `otqs2a@`, `ttg1a@`, `ttg2a@`, `xmcba@`
   - Quyền hạn: Phạm vi dữ liệu bị cô lập tuyệt đối chỉ trong lớp mình phụ trách (chỉ xem và sửa dữ liệu, môn học, trình độ ngoại ngữ của lớp mình).
4. **Tài khoản Học viên:**
   - Đăng nhập bằng **Mã Học Viên** (VD: `HV2022-0101`).
   - Quyền hạn: Chỉ xem bảng điểm cá nhân (cuộn dọc từ Năm 1 đến Năm 5), xuất file cá nhân `Bảng điểm(thông tin cá nhân) - [Họ và tên học viên].xlsx`, và xem/chỉnh sửa trực tiếp Hồ sơ Quân nhân của chính mình (`[ Chỉnh sửa ] / [ Lưu ]`).

## 2. Quản lý Trình độ Ngoại ngữ (Chuẩn đạt & Thực tế)
- **Thiết lập chuẩn ngoại ngữ (Admin):** Cấu hình trực tiếp chuẩn ngoại ngữ hiện tại phải đạt được theo tiến độ đào tạo (`A1.1`, `A1`, `A2.1`, `A2`, `A2.2`, `B1.1`, `B1`, `B1.2`, `B2`).
- **Cập nhật & Đánh giá trình độ (Admin & Tài khoản Lớp):** Chọn trình độ ngoại ngữ thực tế mà học viên đã đạt được; hệ thống tự động so sánh với chuẩn hiện tại và hiển thị rõ trạng thái **"Chưa đạt"** nếu học viên chưa đạt chuẩn yêu cầu.

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

## Xếp loại học tập hệ 10

Xuất sắc: từ 9,00; Giỏi: từ 8,00 đến dưới 9,00; Khá: từ 7,00 đến dưới 8,00; Trung bình khá: từ 6,50 đến dưới 7,00; Trung bình: từ 5,50 đến dưới 6,50; Yếu: từ 5,00 đến dưới 5,50; Kém: dưới 5,00 (bao gồm khoảng 4,00–4,99 và ĐTB thấp hơn 4,00). Xếp loại dùng ĐTB thực tế trước khi định dạng hiển thị.

Trạng thái rớt xét riêng từng môn: điểm môn **dưới 4,00** mới tính rớt; 3,99 rớt, 4,00 không rớt. Điểm trống không được tính là rớt. Nhập tay, nhập Excel và hiển thị/xuất điểm môn giữ hai chữ số thập phân để không biến 3,99 thành 4,0. Quy đổi điểm chữ/hệ 4 giữ quy tắc hiện tại; không dùng nó để xếp loại hệ 10. Thay đổi này không cần sửa schema Supabase (cột điểm hiện là NUMERIC(4,2)).

## Đối chiếu học viên khi nhập Excel

Cả nhập hồ sơ và nhập điểm bắt buộc có cột **Mã HV / Mã học viên**, mỗi dòng dữ liệu phải có mã. Chỉ mã được dùng để đối chiếu (bỏ khoảng trắng đầu/cuối và chuẩn hóa chữ hoa); không tìm theo họ tên và không tự sinh mã khi thiếu. Hai người trùng tên nhưng khác mã là hai học viên khác nhau. File hồ sơ lặp mã sẽ bị từ chối để tránh ghi đè hai dòng không rõ thứ tự. File thiếu mã phải sửa trước khi nhập, không lưu một phần các dòng hợp lệ. Định dạng cột mã trong Excel là Text nếu mã có số 0 đầu.


## Hồ sơ, chuẩn ngoại ngữ và quyền cán bộ

- Bỏ chuẩn CNTT khỏi giao diện, Excel và payload ghi mới. Cột cũ được giữ nguyên nếu đã có để không xóa dữ liệu lịch sử.
- Diện chính trị mặc định Đoàn viên. Đã học cảm tình Đảng không cần ngày; Đảng viên dự bị bắt buộc ngày vào Đảng; chính thức bắt buộc cả ngày vào Đảng và ngày chính thức. Ngày chính thức không được trước ngày vào Đảng.
- Ngày đầy đủ nhận DD/MM/YYYY (hoặc ngày Excel), kiểm tra lịch thật và lưu YYYY-MM-DD; giao diện hiển thị DD/MM/YYYY có số 0. Bố/mẹ chỉ nhập năm 4 chữ số và database lưu nguyên năm, ví dụ `1975`, không tạo ngày 01/01 giả định. Ngày sinh bố/mẹ cũ dạng đầy đủ được đọc về thành năm.
- Chỉ Admin thay đổi chuẩn ngoại ngữ phải đạt. Học viên dưới chuẩn hiện cảnh báo đỏ `Chưa đạt (B1)` tương ứng chuẩn Admin chọn; người mới chưa có trình độ thực tế được ghi `Chưa đạt`, không tự đạt A2. Đổi chuẩn cập nhật lại đánh giá và ghi chú.
- Cán bộ (`canbo`) chỉ xem, lọc và xuất toàn đơn vị. Giao diện ẩn thao tác ghi; các handler và hàm ghi database từ chối vai trò này. Tài khoản lớp giữ phạm vi lớp hiện tại.

**Giới hạn xác thực hiện tại:** tài khoản ứng dụng vẫn được xác thực ở frontend, các yêu cầu Supabase dùng chung khóa công khai. Các kiểm tra vai trò trong JavaScript không thay thế Supabase Auth/RLS; để cưỡng chế quyền khi gọi REST trực tiếp cần chuyển sang danh tính đăng nhập thật và policy dựa trên `auth.uid()`. Không chạy SQL thu hồi quyền anon đơn lẻ vì sẽ chặn cả Admin và tài khoản lớp hiện tại. Thay đổi lần này không tự áp dụng schema/policy lên Supabase thật.
