## InstaWords — تفقيط v${{ needs.build.outputs.version }}

<div dir="rtl">

**العربية**

برنامج Windows **أصلي** لكتابة المبالغ بالحروف للشيكات والفواتير، بالعربية والإنجليزية والفرنسية، بأكثر من 100 عملة ووحدة. ليس موقعاً داخل نافذة: واجهة Windows حقيقية، سريعة وخفيفة، تعمل كلها **دون إنترنت**، ولا تحتاج تثبيت أي شيء إضافي على Windows 10 و11.

- **`InstaWords_${{ needs.build.outputs.version }}_x64-setup.exe`**: المثبّت (موصى به). يثبّت للمستخدم الحالي دون صلاحيات المسؤول، ويحدّث نفسه من داخل البرنامج.
- **`InstaWords_${{ needs.build.outputs.version }}_x64-portable.zip`**: نسخة محمولة: فكّ الضغط وشغّل `InstaWords.exe`.
- **Ctrl+Alt+T** من أي برنامج: انسخ رقماً، اضغط الاختصار، فيصبح ما في الحافظة المبلغَ مكتوباً بالحروف جاهزاً للصق.
- تبويب «دفعة» لتحويل عمود كامل من Excel، مع تصدير CSV.
- ${{ needs.build.outputs.signed == 'true' && 'البرنامج والمثبّت موقّعان رقمياً.' || 'البرنامج غير موقّع رقمياً بعد، لذا قد يظهر تحذير SmartScreen: اختر «مزيد من المعلومات» ثم «تشغيل على أي حال».' }}
- بصمات SHA-256 في `SHA256SUMS.txt`.

</div>

**English**

A **native** Windows app that writes amounts in words for cheques and invoices, in Arabic, English and French, with 100+ currencies and units. Not a website in a window: a real Windows UI, fast and light, that works fully **offline** and needs nothing extra on Windows 10 and 11.

- **`InstaWords_${{ needs.build.outputs.version }}_x64-setup.exe`**: installer (recommended). Per-user, no admin rights; updates itself from inside the app.
- **`InstaWords_${{ needs.build.outputs.version }}_x64-portable.zip`**: portable: unzip and run `InstaWords.exe`.
- **Ctrl+Alt+T** from any program: copy a number, press the shortcut, and the clipboard now holds the amount in words, ready to paste.
- Bulk tab to convert a whole Excel column, with CSV export.
- ${{ needs.build.outputs.signed == 'true' && 'The app and the installer are code-signed.' || 'The app is not code-signed yet, so SmartScreen may warn: click "More info" → "Run anyway".' }}
- SHA-256 checksums: `SHA256SUMS.txt`. winget and Scoop manifests for this version: `winget-manifests.zip`, `instawords.json` (docs/PACKAGING.md).
