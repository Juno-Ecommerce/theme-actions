# Juno-Ecommerce/theme-preview-create

[About this repo](#about-this-repo) | [Usage](#usage) | [Configuration](#configuration)

## About this repo

Create preview theme on Pull Requests using GitHub Actions.

## Usage

```yml
- uses: Juno-Ecommerce/theme-actions/.github/actions/theme-preview-create@main
  with:
    SHOPIFY_PASSWORD: ${{ secrets.PASSWORD }}
    SHOPIFY_SHOP: ${{ secrets.SHOP }}
    IGNORED_FILES: ${{ secrets.IGNORED_FILES }}
```

## Configuration

The `Juno-Ecommerce/theme-preview-create` accepts the following arguments:

- `SHOPIFY_PASSWORD` - (required) The Shopify store's private app password.
- `SHOPIFY_SHOP` - (required) The shopify development store i.e. `my-store.myshopify.com`
- `IGNORED_FILES` - (optional) List of files to ignore
