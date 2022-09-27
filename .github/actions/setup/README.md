# Juno-Ecommerce/theme-preview-action

[About this repo](#about-this-repo) | [Usage](#usage) | [Configuration](#configuration)

## About this repo

Deploy theme files on Pull Requests using GitHub Actions.

## Usage

Add `Juno-Ecommerce/theme-preview-action` to the workflow of your Shopify theme.

```yml
# .github/workflows/generate-preview.yml
name: "🧬 Create preview"

on:
  pull_request:
    types: [labeled, synchronize, reopened, ready_for_review]

jobs:
  create-preview:
    runs-on: ubuntu-latest
    name: "🔎 Generating Preview"
    if: ${{ contains(github.event.*.labels.*.name, 'preview') }}
    steps:
      - name: "Create preview"
        uses: Juno-Ecommerce/theme-preview-action
        with:
          ACTION: "CREATE_PREVIEW"
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SHOPIFY_APP_PW: ${{ secrets.SHOPIFY_APP_PW }}
          SHOPIFY_STORE: "junoify-2-0.myshopify.com"
  delete-preview:
    runs-on: ubuntu-latest
    name: "🔎 Generating Preview"
    if: ${{ contains(github.event.*.labels.*.name, 'preview') }}
    steps:
      - name: "Create preview"
        uses: Juno-Ecommerce/theme-preview-action
        with:
          ACTION: "CREATE_PREVIEW"
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SHOPIFY_APP_PW: ${{ secrets.SHOPIFY_APP_PW }}
          SHOPIFY_STORE: "junoify-2-0.myshopify.com"
```

## Configuration

The `shopify/theme-check-action` accepts the following arguments:

- `theme_root` - (optional, default: `'.'`) Path from repo root to the root of the theme (e.g. `'./dist'`).
- `flags` - (optional) theme-check command line flags. (e.g. `'--fail-level suggestion'`)
- `version` - (optional, default: latest) specific theme-check version to use.
- `token` - (optional) result of `${{ github.token }}` to enable GitHub check annotations.
- `base` - (optional) When `token` is set, only the files that contain a diff with this ref (branch, tag or commit) will have GitHub check annotations.
