# Vendored libraries (PDF Kit)

Served from this site so the tools work offline and never load code from another host (no CDN).
Each file is copied byte-for-byte from the package's npm registry tarball; the tarballs' `dist.integrity`
(sha512) was checked against the registry before copying. Update by downloading the new tarball,
copying the same files into a new `<package>-<version>/` folder, updating the paths in `../pdf/core.js`
and `../sw.js` (and bumping its `VERSION`), and regenerating the table below
(`npm test` / `node tests/pdf-kit.mjs` checks every hash).

| Package | Version | License | Source |
|---|---|---|---|
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 (2021-11-06, latest) | MIT (`pdf-lib-1.17.1/LICENSE.md`) | `https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz`, file `dist/pdf-lib.esm.min.js` |
| [pdfjs-dist](https://github.com/mozilla/pdf.js) (pdf.js) | 6.5.438 (2026-11-01, latest) | Apache-2.0 (`pdfjs-dist-6.5.438/LICENSE`) | `https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.5.438.tgz`, files `legacy/build/pdf.min.mjs`, `legacy/build/pdf.worker.min.mjs` (the legacy build, for older browsers), `standard_fonts/`, `wasm/`, `iccs/` |

Tarball integrity (npm `dist.integrity`):
- pdf-lib-1.17.1.tgz: `sha512-V/mpyJAoTsN4cnP31vc0wfNA1+p20evqqnap0KLoRUN0Yk/p3wN52DOEsL4oBFcLdb76hlpKPtzJIgo67j/XLw==`
- pdfjs-dist-6.5.438.tgz: `sha512-vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA==`

Notes:
- pdf-lib's bundle also contains pako (MIT + Zlib), tslib 1.x (Apache-2.0), @pdf-lib/upng (MIT) and @pdf-lib/standard-fonts (MIT).
  pdf-lib has had no release since 2021; it only ever sees files the visitor picks on their own device.
- pdf.js's optional data, each with its license file next to it: `standard_fonts/` (Foxit fonts: BSD-style, `LICENSE_FOXIT`;
  Liberation Sans: GPLv2 with the font exception, `LICENSE_LIBERATION`), `wasm/` (PDFium jbig2: BSD-style; OpenJPEG: BSD-2-Clause;
  qcms: MIT; pdf.js glue: Apache-2.0; `LICENSE_*`), `iccs/` (CC0 1.0, `iccs/LICENSE`).
  The pdf.js scripting sandbox (quickjs: `wasm/quickjs-eval.*` and its `LICENSE_*QUICKJS`) and CMaps are not included: PDF Kit never runs PDF JavaScript.
- `pdf-lib.esm.min.js` ends with a `sourceMappingURL` comment; the map is not shipped (only browser dev tools would ask for it).

## sha256 of every file

| sha256 | File |
|---|---|
| `f2c9fc00fdb66eb99ac156ba52d734af66d8d309f65753ae809ad34ee2883bcb` | `pdf-lib-1.17.1/LICENSE.md` |
| `72c052d97b4d5d9fa6cdbdcb7ad709f03d4ddb1122390cb3afeba4d88651d969` | `pdf-lib-1.17.1/pdf-lib.esm.min.js` |
| `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` | `pdfjs-dist-6.5.438/LICENSE` |
| `73e1ba37d2bad5bab2a964f40a9eed96209666efc067c3322626214bbef234a0` | `pdfjs-dist-6.5.438/iccs/CGATS001Compat-v2-micro.icc` |
| `286e4fd7b447330b2c88e23890e3cd0a9d38cb398d4a59cb247f578ccbda3213` | `pdfjs-dist-6.5.438/iccs/LICENSE` |
| `522ad2c83bc8a0010e7f0cc60d0892b77c8d2bf2c9702dc12288311d94270f42` | `pdfjs-dist-6.5.438/pdf.min.mjs` |
| `b4c8353ded0d88d2e2009574a29eb4e0c3ff7e942ecdf51ef5f71566a9667f31` | `pdfjs-dist-6.5.438/pdf.worker.min.mjs` |
| `845c752392b6c914fb989c75a08b7792b88f542d2499042ef2889f8c814a16ed` | `pdfjs-dist-6.5.438/standard_fonts/FoxitDingbats.pfb` |
| `b6c8fe53f134b8b6d4578cd2d544df4cee9624c4efa8d51a560fb40ea296101b` | `pdfjs-dist-6.5.438/standard_fonts/FoxitFixed.pfb` |
| `f1b7159702973f54fc86254ea38bcf3712b2a736eb3a0995751e9f4bb45ad603` | `pdfjs-dist-6.5.438/standard_fonts/FoxitFixedBold.pfb` |
| `8a000945843bd31add06aee63bf9fd41b7578b4f3242a4b7cd46349ad9d24d4d` | `pdfjs-dist-6.5.438/standard_fonts/FoxitFixedBoldItalic.pfb` |
| `5007faf8320fa1fcc08b8894b356ad976f60b992ba29ee5272578bbdebaf3876` | `pdfjs-dist-6.5.438/standard_fonts/FoxitFixedItalic.pfb` |
| `4f57d2b9d884af8f907bf22df6019b52d86cbf6214fdbd02b1ae05472a543f35` | `pdfjs-dist-6.5.438/standard_fonts/FoxitSerif.pfb` |
| `0bdf4b04e964139818d51eda03d566ba999fc3ba2421b1c6c51f9dc969022e80` | `pdfjs-dist-6.5.438/standard_fonts/FoxitSerifBold.pfb` |
| `a406cac82583bf98175cb62c87ed5e95c45fbb34eece63a10b0a13e793cb2e10` | `pdfjs-dist-6.5.438/standard_fonts/FoxitSerifBoldItalic.pfb` |
| `610ae0687198045c4db5d1a6650fd5e92536631706382eb8b72e38df578d0ae9` | `pdfjs-dist-6.5.438/standard_fonts/FoxitSerifItalic.pfb` |
| `47967d055530e7357088a08403115425643ec2cdfd6201ba8af0fbd7116c1539` | `pdfjs-dist-6.5.438/standard_fonts/FoxitSymbol.pfb` |
| `b578cdd2345840ada550bd12519533812320d5f1d21cf4c1c7e1b1b0a31c98b7` | `pdfjs-dist-6.5.438/standard_fonts/LICENSE_FOXIT` |
| `d2c4d5b3e115a519cb58eb691aa64538397e2611f9ebe801392cf9667997e7dc` | `pdfjs-dist-6.5.438/standard_fonts/LICENSE_LIBERATION` |
| `361c61b82d575c5c35fd9157fda8b0194bcfcd0d88ea8521a4fb5dd53d33dddc` | `pdfjs-dist-6.5.438/standard_fonts/LiberationSans-Bold.ttf` |
| `a224075ac17495ad0a3af3bc0a419ac0704a8b3fd1095456201fb9b095fc281d` | `pdfjs-dist-6.5.438/standard_fonts/LiberationSans-BoldItalic.ttf` |
| `832b4406dbef23628800d3aaad21048534ac84d7e3ad955be83b8172ed8ef512` | `pdfjs-dist-6.5.438/standard_fonts/LiberationSans-Italic.ttf` |
| `f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f` | `pdfjs-dist-6.5.438/standard_fonts/LiberationSans-Regular.ttf` |
| `9e66b7f1b934a28b37f3bc4dac97915de1674271e79a0a88182a18ed9731b4d1` | `pdfjs-dist-6.5.438/wasm/LICENSE_JBIG2` |
| `a6af136f3e15038a666b61f376612a07d9a4e48cb7c01adbf3e33b3f14ab49b6` | `pdfjs-dist-6.5.438/wasm/LICENSE_OPENJPEG` |
| `aad3cce09842e00e9e11ad5e8fef8cc02fbc3a3768fe2f007443b9cee37aaee5` | `pdfjs-dist-6.5.438/wasm/LICENSE_PDFJS_JBIG2` |
| `717fc62da03292dbb4dd0c8280bd4ce7bb8550dcf31d772bc93455fb50313425` | `pdfjs-dist-6.5.438/wasm/LICENSE_PDFJS_OPENJPEG` |
| `508a77d2e7b51d98adeed32648ad124b7b30241a8e70b2e72c99f92d8e5874d1` | `pdfjs-dist-6.5.438/wasm/LICENSE_PDFJS_QCMS` |
| `36d847ae882f6574ebc72f56a4f354e4f104fde4a584373496482e97d52d31bc` | `pdfjs-dist-6.5.438/wasm/LICENSE_QCMS` |
| `466f45c2a61a698152fb5400c27e56ff2ceb73dcb71fde3fc366a502308eaab0` | `pdfjs-dist-6.5.438/wasm/jbig2.wasm` |
| `70150223396487e1ccfef7eac61fc780074ad7fcc9e843b702a8a3bc23107494` | `pdfjs-dist-6.5.438/wasm/jbig2_nowasm_fallback.js` |
| `7ea4b2b04613370ad4e9c1162da750cc88b4b176eac0d0c164b3caff23fc0a46` | `pdfjs-dist-6.5.438/wasm/openjpeg.wasm` |
| `2855f1590e7fd7abbbf204cd13a5c09d30c92fe2c9313fb72b64aa763fe8b4f3` | `pdfjs-dist-6.5.438/wasm/openjpeg_nowasm_fallback.js` |
| `663d86126d5f5fcb1c61490f94353e2a8375660b8c5498ab3ebab5a34b08800e` | `pdfjs-dist-6.5.438/wasm/qcms_bg.wasm` |
