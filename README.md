# Papikapi Studio

The web studio where papikapi's papercraft figures are created and inspected. It shows the
model catalogue, starts a new figure from a prompt, follows its progress through the pipeline,
and renders the 3D model and its assembly with three.js.

The studio is only the interface. The generation pipeline, the database and the published media
live in [papikapi-api](../papikapi-api), which it calls on port 4505.

This app is a submodule of [ibid-workspace](https://github.com/alexibid/ibid-workspace).

## Structure

```
apps/papikapi-studio/
  src/app/
    domain/          assembly geometry and models
    application/     model catalogue, creator, creation progress, cost, assembly plan
    ui/
      pages/studio/  the single page
      components/    model-viewer-3d, assembly-viewer, model-creator, process-loader
  e2e/               the catalogue journey, with a fixture model, gallery and PDF
  proxy.conf.json    /api and /models forwarded to papikapi-api on 4505
```

The build serves `apps/papikapi-api/public/models` under `/models`, together with the
`ibid-ui` icons. The app uses `ibid-ui` with the `papikapi` theme, and its selectors start
with `papikapi-`.

## Commands

Run from the workspace root. Start the API first.

| For                    | Command                          |
| :--------------------- | :------------------------------- |
| The API (port 4505)    | `npm run server:papikapi-studio` |
| The studio (port 4500) | `npm run serve:papikapi-studio`  |
| Build                  | `npm run build:papikapi-studio`  |
| Journeys               | `npm run e2e:papikapi-studio`    |
| Lint                   | `npx nx lint papikapi-studio`    |

The studio is web only: its tags skip the Android and desktop platforms, and its `desktop`
targets are empty.

The pipeline's stages and commands are in the [papikapi-api README](../papikapi-api/README.md)
and its [PIPELINE.md](../papikapi-api/PIPELINE.md).
