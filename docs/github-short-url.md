# Địa chỉ GitHub Pages ngắn

Địa chỉ dự kiến: https://huudung304.github.io/

Địa chỉ này chỉ hoạt động sau khi tạo repository và bật Pages. Không đổi tên hoặc xóa repository `duanbyhdung`, để địa chỉ cũ tiếp tục hoạt động.

1. Tạo repository public tên `huudung304.github.io` trong tài khoản `HuuDung304`.
2. Chạy `npm run build` ở dự án này. Upload **nội dung bên trong** `dist/` (gồm `index.html` và `src/`) vào gốc repository mới, nhánh `main`. Không upload nguyên thư mục `dist` thành một cấp thư mục.
3. Trong repository mới: Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save.
4. Chờ quy trình Pages hoàn tất rồi mở https://huudung304.github.io/. Kiểm tra đăng nhập và dữ liệu. Repository cũ vẫn phục vụ https://huudung304.github.io/duanbyhdung/.

Hai bản dùng cùng kết nối Supabase nên không cần sao chép hay chỉnh sửa database. Khi sửa code sau này, phải cập nhật cả repository mới nếu muốn hai địa chỉ luôn cùng phiên bản.

Không cần mua tên miền, không cần file CNAME cho địa chỉ github.io. Không tự động chuyển hướng link cũ cho đến khi đã xác nhận địa chỉ mới hoạt động.
