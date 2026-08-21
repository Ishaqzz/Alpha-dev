# artifacts/

This folder holds binary assets that are **not committed to Git** but are needed at build time.

## Logo Setup

Place the project logo here as `logo.jpg` before running the copy script:

```
artifacts/
  logo.jpg   ← put your logo here
```

Then run:

```bash
node scripts/copy-logo.js
```

This copies it to `assets/images/logo.jpg` which **is** committed to Git and used by the app.

## Why this folder exists

`scripts/copy-logo.js` previously contained a hardcoded absolute path
(`C:\Users\ishaq\...`) which broke on any other machine. By using this
`artifacts/` drop folder the script becomes fully portable — it resolves
paths relative to the project root via `__dirname`.
