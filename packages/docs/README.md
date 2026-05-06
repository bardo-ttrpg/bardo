# @bardo-ttrpg/docs

Public MDX documentation content and navigation metadata for Bardo.

This package is the canonical source for community-editable Bardo docs. Website apps should import MDX from this package instead of keeping a private copy of the same files.

## Local Development

During local development, a consuming app can link this package from a sibling checkout:

```sh
pnpm --dir ../bardo-app install
```

The current private website checkout uses a local `link:` dependency until this package is published.

## Publishing

Publishing requires npm authentication for an owner of the `@bardo-ttrpg` scope:

```sh
npm login
pnpm --filter @bardo-ttrpg/docs publish --access public
```

After the first publish, consuming apps can replace the local link with a normal semver dependency such as:

```json
"@bardo-ttrpg/docs": "0.1.0"
```
