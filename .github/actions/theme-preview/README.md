# Juno-Ecommerce/theme-preview-action

[About this repo](#about-this-repo) | [Usage](#usage) | [Configuration](#configuration)

## About this repo

Deploy theme files on Pull Requests using GitHub Actions.

## Usage

Add `Juno-Ecommerce/theme-preview-action` to the workflow of your Shopify theme.

```yml
# .github/workflows/theme-preview.yml
name: "🧬 Theme preview"

on:
  pull_request:
    types: [labeled, synchronize, reopened, ready_for_review]

concurrency:
  group: ci-theme-preview-${{ github.ref }}-1
  cancel-in-progress: true

jobs:
  add-comment:
    runs-on: ubuntu-latest
    name: Add preview comment
    uses: mshick/add-pr-comment@v1
    with:
      message: |
        :exclamation: **Create a Preview theme** :exclamation:
        To create a preview theme add `preview` to the labels on the right hand side
      repo-token: ${{ secrets.GITHUB_TOKEN }}
      repo-token-user-login: "github-actions[bot]"
  create-preview:
    runs-on: ubuntu-latest
    if: contains(github.event.*.labels.*.name, 'preview') && contains(fromJson('["labeled", "synchronize", "reopened", "ready_for_review"]'), github.event_name)
    uses: Juno-Ecommerce/theme-preview-action
    with:
      ACTION: "CREATE_PREVIEW"
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      SHOPIFY_APP_PW: ${{ secrets.SHOPIFY_APP_PW }}
      SHOPIFY_STORE: "mystore.myshopify.com"
  remove-preview:
    runs-on: ubuntu-latest
    if: contains(github.event.*.labels.*.name, 'preview') && contains(fromJson('["closed"]'), github.event_name)
    uses: Juno-Ecommerce/theme-preview-action
    with:
      ACTION: "REMOVE_PREVIEW"
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      SHOPIFY_APP_PW: ${{ secrets.SHOPIFY_APP_PW }}
      SHOPIFY_STORE: "mystore.myshopify.com"
```

## Configuration

The `Juno-Ecommerce/theme-preview-action` accepts the following arguments:

- `ACTION` - (required) `CREATE_PREVIEW` or `REMOVE_PREVIEW`.
- `BUILD_DIRECTORY` - (required) Path to dist folder created by webpack build.
- `GITHUB_TOKEN` - (optional) Github authentication token that allows comments to be created on PRs.
- `SHOPIFY_APP_PW` - (required) The Shopify store's private app password used to access themes REST API.
- `SHOPIFY_STORE` - (required) The shopify development store i.e. `my-store.myshopify.com`
