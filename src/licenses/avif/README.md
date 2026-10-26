# AVIF codec notices

Toolsiano uses the unmodified single-thread encoder shipped in `@jsquash/avif` 2.1.1 (Apache-2.0; its root LICENSE is collected from the npm package).

Package source commit: b7fa9ac9ec02f224847ad23d19d115f9e296a368.
The upstream build recipe identifies these bundled components:
https://github.com/jamsinclair/jSquash/blob/b7fa9ac9ec02f224847ad23d19d115f9e296a368/packages/avif/codec/Makefile

- libavif 1.0.1: https://github.com/AOMediaCodec/libavif/tree/v1.0.1
- libaom 3.7.0: https://aomedia.googlesource.com/aom/+/refs/tags/v3.7.0/
- libsharpyuv from libwebp commit e2c85878f6a33f29948b43d3492d9cdaf801aa54: https://chromium.googlesource.com/webm/libwebp/+/e2c85878f6a33f29948b43d3492d9cdaf801aa54/

Unmodified license and patent notices are retained alongside this document and appended to `third-party-licenses.txt` in both web and desktop builds. Codec binaries are served from the same origin and shipped inside the desktop package.
