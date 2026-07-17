# Textbook asset delivery

The production reader uses a Cloudflare Worker backed by the `kebiao-textbooks`
R2 bucket. Object keys stay identical to the private asset registry, for example:

```text
objects/sha256/57/57886626ca0098ffd66fb2dd8548770b5fe4c9359af0d1916ac59e919a8dbb23.pdf
```

The Worker exposes only `GET`, `HEAD`, and `OPTIONS`. It supports single HTTP
byte ranges for PDF.js and returns immutable cache metadata because every
public object key is content-addressed.

Initial and incremental imports use Cloudflare R2's S3-compatible endpoint with
a short-lived, bucket-scoped Object Read & Write credential. The deployed Worker
never receives upload credentials and has no write route.
