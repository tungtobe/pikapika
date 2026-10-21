# Pokémon Pocket

Vite + EmulatorJS 4.2.3 / Gambatte để chơi Red và Blue, cả tiếng Anh và tiếng Việt. Chạy trên localhost hoặc deploy dạng website tĩnh HTTPS, cài lên màn hình chính và chơi offline. Không cần backend, tài khoản hay cơ sở dữ liệu trên server.

## Chạy trên máy

```sh
npm ci
npm run setup:emulator
npm run sync:roms
npm run dev
```

Mở **http://localhost:5173**. Node.js >= 22.12. `setup:emulator` tải runtime đã ghim SHA-256; `sync:roms` kiểm tra checksum rồi đọc ROM từ repo kế bên `../pokered`. Chỉ hai bước chuẩn bị này cần mạng / repo ROM; bản deploy không cần repo kế bên, RGBDS hoặc công cụ build ROM.

ROM Việt được build bằng `make vietnamese` trong repo `pokered`. Đồng bộ lại sau mỗi lần build để cập nhật cả ROM và checksum. Trang chủ mặc định mở bản tiếng Việt của Red / Blue vừa chọn. Bạn vẫn có thể chọn English hoặc mở URL ROM tiếng Anh trực tiếp. Mỗi ROM / ngôn ngữ có save riêng. `?game=red-vi` và `?game=blue-vi` mở bản Việt trực tiếp.

## Deploy Vercel

Chuẩn bị gói độc lập trên máy này:

```sh
npm run package:deploy
```

Lệnh kiểm tra SHA-1 cả 4 ROM, SHA-256 runtime, build PWA và tạo:

- **`artifacts/vercel/`**: source Vite tự đủ, chứa ROM + runtime + lockfile + `vercel.json`. Không cần repo `pokered` bên cạnh khi build trên cloud.
- **`dist/`**: website tĩnh đã build, sẵn cho host khác.
- **`artifacts/pokered-player-vercel.zip`**: gói source Vercel; giải nén trước khi dùng CLI / Git.
- **`artifacts/pokered-player-static.zip`**: bản tĩnh để kéo thả lên Netlify Drop / host hỗ trợ ZIP. Script đóng gói dùng `zip` có sẵn trên macOS.

Deploy gói source qua CLI (lệnh dưới sẽ đăng nhập / upload khi bạn chạy):

```sh
cd artifacts/vercel
npx vercel --prod
```

Hoặc đưa **toàn bộ nội dung `artifacts/vercel/`** vào một Git repository riêng rồi Import Project trên Vercel. Framework **Vite**, Build Command **`npm run build`**, Output Directory **`dist`**, Install Command **`npm ci`**; `vercel.json` đã đặt sẵn. Không cần biến môi trường.

Nếu dùng Git, phải có `public/roms/*.gbc` và `public/emulatorjs/` trong repository deploy. Repo phát triển gốc cố ý gitignore chúng; chỉ push source gốc sẽ thiếu game. Gói `artifacts/vercel/` được tạo không có quy tắc gitignore này. Không commit `node_modules`, `dist` hoặc bản sao `artifacts` lồng nhau.

Không thêm rewrite `/(.*) → /index.html`, `cleanUrls`, hoặc middleware đăng nhập cho assets. Ứng dụng có hai HTML entry; ROM / WASM thiếu phải trả lỗi, không được trả HTML. Deploy ở **gốc domain** (ví dụ `https://your-project.vercel.app/`); chưa hỗ trợ đường dẫn con kiểu `/pokered/`.

Chọn URL production ổn định để chơi. Mỗi URL preview Vercel là một địa chỉ có kho save riêng. Cập nhật production trên cùng tên miền giữ save; nếu checksum ROM đổi, web tự chuyển mốc **SAVE trong game** sang bản ROM tương thích mới.

## Host tĩnh miễn phí khác

Sau `npm run package:deploy`, upload **nội dung `dist/`** bằng Netlify Drop hoặc Cloudflare Pages Direct Upload. Không cần chạy server Node. File `_headers` đã cấu hình không cache lâu service worker / manifest. Host cần HTTPS, phục vụ nguyên file `.gbc`, `.data`, `.wasm` và cả `emulator.html`; không bật fallback mọi URL sang `index.html`.

Lần đầu phải mở có mạng và đợi dòng **“Cả 4 ROM đã sẵn sàng chơi offline”**. Khoảng 7,1 MiB nội dung được precache, bao gồm cả 4 ROM và core. Sau đó có thể bật chế độ máy bay, đóng/mở lại ứng dụng và chơi. Offline được bật ở bản production, không bật trong Vite dev.

## Cài và chơi trên iPhone

1. Mở URL **HTTPS production** trong Safari. Đợi tải xong dữ liệu offline.
2. Chọn **Chia sẻ → Thêm vào Màn hình chính**. Nếu có “Mở dưới dạng ứng dụng web”, giữ bật.
3. Mở bằng icon **Pokémon Pocket**, chờ dòng sẵn sàng offline rồi bắt đầu chơi. Nên cài trước khi chơi lâu; Safari và ứng dụng màn hình chính có thể dùng kho dữ liệu riêng.
4. D-pad để di chuyển, **A** xác nhận, **B** quay lại, **START / SELECT** ở giữa. Hỗ trợ nhiều ngón cùng lúc và vuốt đổi hướng trên D-pad. Nút **⛶** mở chế độ chơi gọn màn hình; bấm lại để thoát. Xoay ngang có bố cục điều khiển hai bên.
5. Nếu trình duyệt chặn âm thanh lúc khởi động, ứng dụng hiện **Tiếp tục chơi** để bạn chạm và cho phép chạy; khôi phục save sẽ tiếp tục sau thao tác đó. Nếu chưa nghe tiếng, chạm **♪ Âm thanh**, nút A hoặc màn hình game. Khi chuyển ứng dụng / khóa màn hình, game tạm dừng và lưu; lúc quay lại chạm **Tiếp tục chơi** để chạy và khôi phục âm thanh.

`localhost` trên iPhone là chính điện thoại, không phải máy Mac. Để dùng PWA / offline / kiểm tra đầy đủ trên iPhone, mở website HTTPS đã deploy. Không cần thêm cấu hình CORS hay SharedArrayBuffer: core chạy một luồng, mọi dữ liệu cùng origin.

## Bàn phím và gamepad

| Thao tác | Bàn phím | Gamepad chuẩn |
| --- | --- | --- |
| Di chuyển | Mũi tên | D-pad / cần trái |
| A — xác nhận | Z | Nút dưới (A / Cross) |
| B — quay lại | X | Nút bên phải (B / Circle) |
| Start | Enter | Start |
| Select | Shift | Select / Back |
| Lưu nhanh | F6 | Nút Lưu nhanh trên trang |
| Tải bản lưu nhanh | F8 | Nút Tải lại trên trang |

Bấm màn hình nếu bàn phím chưa có hiệu lực. Kết nối tay cầm Bluetooth / USB và nhấn một nút để trình duyệt nhận thiết bị. Biểu tượng tay cầm trong emulator cho phép đổi mapping. Cần trái có dead zone 0.45; cầu nối cần trái luôn dùng bốn hướng mặc định. Gamepad trên iPhone phụ thuộc hỗ trợ của iOS / trình duyệt / loại tay cầm.

## Tiến trình trên từng máy

- IndexedDB giữ **tự lưu** toàn bộ trạng thái mỗi **5 giây**, khi tạm dừng, trước đổi ROM / cập nhật web và khi chuyển ứng dụng. Mở lại URL hiện tại sẽ giữ phiên bản / ngôn ngữ; vào trang chủ không có tham số sẽ ưu tiên tiếng Việt của Red / Blue vừa chọn; bấm Bắt đầu để tự tiếp tục. Snapshot được ghi trước khi chờ đồng bộ battery save.
- **Lưu nhanh** là mốc riêng, không bị tự lưu ghi đè. F8 / Tải lại quay về mốc này.
- Save trong game (Start → Save) là battery save của Pokémon, đồng bộ cùng mỗi lần lưu của ứng dụng. **Xuất file save** tạo `.save.json` chứa trạng thái, battery save và checksum. **Nhập file save** kiểm tra đầy đủ trước khi thay thế mốc tự lưu + lưu nhanh.
- Save tách theo **máy / trình duyệt / profile / địa chỉ website / SHA-1 ROM**. Không có đồng bộ đám mây. Không tự chuyển save giữa Red / Blue hoặc Anh / Việt.
- Khi checksum ROM đổi và bản mới chưa có tiến trình, web tìm SAVE hợp lệ gần nhất của đúng game / ngôn ngữ và cùng định dạng SRAM. Bản lưu cũ được giữ nguyên, kể cả khi chuyển không thành công. Save state cũ chỉ dùng với đúng checksum; ROM mới khởi động lại để bạn chọn **TIẾP TỤC / CONTINUE** từ lần SAVE trong game gần nhất.
- **Giữ dữ liệu trên máy** yêu cầu persistent storage nếu trình duyệt hỗ trợ; giao diện hiển thị kết quả thực tế, không giả định được cấp quyền.
- Xuất file save trước khi chuyển từ localhost sang website, đổi domain, chuyển máy, xóa dữ liệu web hoặc cài lại ứng dụng. Trên iPhone, giữ file trong Files / iCloud Drive, rồi Nhập file save tại đúng phiên bản game. Đừng dùng chế độ duyệt riêng tư để chơi lâu dài.
- iOS / trình duyệt vẫn có thể thu hồi dữ liệu khi thiếu dung lượng hoặc khi bạn xóa dữ liệu website. Không thể bảo đảm hoàn tất ghi nếu hệ điều hành đóng tiến trình đột ngột; bấm **Lưu nhanh** và chờ thông báo thành công trước khi thoát, thường xuyên xuất backup. Chỉ mở một tab game cho mỗi ROM để tránh ghi đè lẫn nhau.

Bản cập nhật mới chỉ hiện nút **Lưu & cập nhật**. Game được tạm dừng và lưu thành công trước khi service worker mới áp dụng / tải lại trang. Cập nhật ứng dụng không xóa IndexedDB save.

## Cập nhật ROM và chuyển save

1. Trước khi cập nhật, người chơi dùng **START → SAVE** (LƯU trong bản Việt), đợi game báo lưu xong, rồi **Xuất file save** để giữ bản dự phòng. Nút Lưu nhanh / tự lưu của web không tạo một lần SAVE mới trong menu Pokémon.
2. Build ROM mới, chạy `npm run sync:roms`, build và deploy web như bình thường. Giữ nguyên tên miền production.
3. Trên bản mới, bấm **Bắt đầu chơi**. Nếu chưa có checkpoint cho checksum mới, web tự chuyển SAVE hợp lệ gần nhất, hiện thông báo, rồi khởi động lại game. Chọn **TIẾP TỤC / CONTINUE** trong menu Pokémon. Các bước chơi sau lần SAVE trong game gần nhất không đi theo sang ROM mới.
4. Đổi máy / domain: mở đúng game và ngôn ngữ rồi **Nhập file save**. File cùng ROM khôi phục nguyên save state; file ROM cũ tương thích chuyển dữ liệu SAVE và khởi động lại game. Nhập file thay thế mốc tự lưu và lưu nhanh của ROM đích, nên xuất bản hiện tại trước nếu cần giữ.

File xuất mới có `version: 2`, `game` và `saveSchema`; vẫn đọc file `version: 1` của ứng dụng cũ. Với các bản phát hành cũ chưa có metadata trong IndexedDB, web trích SRAM từ checkpoint Gambatte và kiểm tra checksum theo thuật toán gốc của Pokémon. Nếu chưa từng SAVE hoặc SAVE bị hỏng, web thông báo và giữ nguyên bản cũ; cần mở lại bản web/ROM cũ trên cùng domain, khôi phục tiến trình, SAVE rồi xuất file. Không đổi checksum trong JSON bằng tay.

`src/games.js` khai báo định dạng tương thích `pokered-sram-v1`, độc lập với SHA-1. Sửa câu chữ / font / bản dịch mà không đổi dữ liệu lưu có thể giữ định dạng này. Nếu thay bố cục SRAM, ý nghĩa ID map / Pokémon / item hoặc các dữ liệu lưu khác, **phải đổi `saveSchema`** và viết bộ chuyển tương ứng trước khi phát hành; không chỉ bỏ kiểm tra checksum. Giữ bảng `legacySaveGames` để nhận diện save từ các bản phát hành cũ. Không tự chuyển giữa Red / Blue hoặc Anh / Việt.

Core nhận trực tiếp ROM đã xác minh SHA-1, dùng tên nội bộ chứa checksum để tách file SRAM giữa các bản build. Cơ chế này tránh bộ nhớ đệm theo tên/kích thước file của EmulatorJS dùng nhầm ROM cũ hoặc tự nạp SAVE của một bản có bố cục không tương thích. Các checkpoint hiện có vẫn nằm trong IndexedDB `pokered-player` phiên bản 1, không xóa hay đổi khóa.

## Xuất / nhập save trên điện thoại

Mở đúng bản game (Red / Blue, Anh / Việt) và bấm **Bắt đầu chơi** trước; các nút xuất / nhập chỉ bật khi game đã sẵn sàng.

- **Xuất trên iPhone:** bấm **Xuất file save**. Tìm file `.save.json` trong **Tệp → Duyệt → Tải về**, ở iCloud Drive hoặc Trên iPhone tùy nơi Safari lưu tải xuống. Nếu máy mở bản xem trước file, dùng **Chia sẻ → Lưu vào Tệp**. Có thể giữ bản sao trong iCloud Drive hoặc gửi qua AirDrop.
- **Nhập trên iPhone:** trong game, bấm **Nhập file save**, chọn **Chọn tệp / Duyệt** nếu có, tìm file trong Tệp / iCloud Drive rồi chọn. Đợi thông báo **Đã nhập save**. Không cần mở file JSON bên ngoài trước.
- **Android:** file xuất nằm trong **Tải xuống / Downloads** của Chrome hoặc ứng dụng quản lý tệp. Khi nhập, bấm **Nhập file save** và chọn file từ Tải xuống / Google Drive nếu đã lưu ở đó.

File phải thuộc đúng game / ngôn ngữ; ROM cũ cần có định dạng SAVE tương thích như mô tả ở trên. Nhập thành công thay thế cả mốc tự lưu và lưu nhanh của bản game đó; nên xuất tiến trình hiện tại trước nếu muốn giữ lại. Chơi tiếp trên cùng thiết bị / địa chỉ web thì dùng tự lưu, không cần xuất và nhập mỗi lần.

Tham khảo: [Apple — tìm file tải xuống trong Tệp](https://support.apple.com/102440), [Chrome Android — tải xuống và tìm file](https://support.google.com/chrome/answer/95759?co=GENIE.Platform%3DAndroid).

## Icon ứng dụng

Icon PWA, icon iPhone và favicon dùng hình Poké Ball. Vector gốc ở `public/icons/pokeball.svg`; chạy `node scripts/generate-icons.mjs` để tạo lại PNG 192, 512 và Apple 180 px (cần Google Chrome). Các PNG đã nằm trong Git nên Vercel không cần chạy bước tạo icon.

Tên file icon mới giúp trình duyệt nhận diện thay đổi sau deploy. iOS có thể giữ icon đã cài trong bộ nhớ đệm; hãy xuất backup trước nếu định gỡ rồi thêm lại ứng dụng màn hình chính, để có thể nhập lại tiến trình nếu cần.

## Kiểm thử

```sh
npm test
npx playwright install webkit
npm run test:pwa
npm run build
```

`npm test`: Chrome, boot cả 4 ROM, menu / hội thoại Việt thực, keyboard, gamepad giả lập, save / load / backup checksum, reload và tách save theo ROM.

`npm test -- tests/migration.spec.js`: dùng SAVE mẫu tạo từ menu gốc của Pokémon, mô phỏng hai bản ROM có SHA-1 khác nhau và xác minh ROM thực trong core, chọn CONTINUE để đọc lại tên nhân vật / bản đồ, giữ nguyên checkpoint cũ, nhập file cũ, từ chối sai game / ngôn ngữ / schema / checksum, khôi phục khi chuyển lỗi và tách file SRAM gốc giữa các bản build.

`npm run test:pwa`: chạy bản production trên `127.0.0.1:4173`, cả Chrome và WebKit giả lập iPhone 13; kiểm tra manifest, precache, khởi động 4 ROM sau khi ngắt mạng, mở lại save, dữ liệu riêng theo context, touch nhiều ngón / hủy chạm, tự lưu khi chuyển nền, âm thanh, bố cục ngang/dọc và cập nhật service worker chỉ tải lại sau khi đã lưu. Context kiểm thử tách khỏi profile chơi game của bạn. WebKit giả lập không thay thế kiểm thử trên iPhone / tay cầm vật lý.

Preview tại `http://localhost:5173` bằng `npm run preview` sau khi dừng dev server. Cổng cố định để không vô tình tạo kho save ở địa chỉ khác. Server kiểm thử production 4173 dùng kho riêng.

## Nguồn và license

- [Vite PWA — precache và cập nhật](https://vite-pwa-org.netlify.app/guide/)
- [Vercel — Vite](https://vercel.com/docs/frameworks/frontend/vite)
- [WebKit — chính sách lưu trữ và persistent storage](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [WebKit — ứng dụng màn hình chính iPhone](https://webkit.org/blog/13878/)
- [EmulatorJS 4.2.3](https://github.com/EmulatorJS/EmulatorJS/releases/tag/v4.2.3)
- [GameManager và save](https://github.com/EmulatorJS/EmulatorJS/blob/v4.2.3/data/src/GameManager.js)

EmulatorJS GPL-3.0, license đi kèm tại `public/emulatorjs/LICENSE`; runtime giữ nguyên file đã ghim trong `emulator-assets.json`. Core Gambatte có thông tin license trong gói core. Các quyền ROM thuộc chủ sở hữu tương ứng. Thay đổi PWA không sửa ROM hoặc gameplay.
