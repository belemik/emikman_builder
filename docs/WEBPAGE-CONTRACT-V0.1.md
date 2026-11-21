# WebPage contract v0.1

The draft covers one static event page. Its root contains exactly `version: "0.1"`,
`hero` and `program`. The [valid fixture](../tests/fixtures/web-page/event.valid.json)
shows all fields.

| Block | Fields and limits |
| --- | --- |
| Hero | `layout` is `stack` or `split`. `heading` holds up to 100 UTF-16 units. `body`, `image` and `cta` are required. |
| Text | `text` holds up to 500 units. |
| Image | `assetId` is a key in the fixed code-owned catalog. `alt` holds up to 160 units. |
| CTA | `label` holds up to 60 units. `targetId` must equal the program section ID. |
| Program | `id` is 1–40 lowercase ASCII letters, digits or hyphens, starting with a letter. `heading` holds up to 100 units. `items` contains 1–8 text blocks. |

Content strings must be nonblank and contain no angle brackets or C0/C1 control
characters. The format has no markup, styles, code, action handlers or URL
fields. Text is inert even when it contains text resembling a URL or code. A
future renderer must use text sinks, resolve asset paths only through the trusted
catalog using the existing `assetUrl` helper for the application base path, and
namespace DOM anchor IDs to the preview instance. Layout values
select presets; viewport behavior belongs to the future renderer.

`validateWebPage` accepts only primitive JSON text (at most 16,384 UTF-8 bytes).
The existing read-only JSON key and Unicode checker provides grammar, duplicate
key and Unicode checks. The WebPage validator enforces its own closed shapes,
content limits and references. A failure returns the first diagnostic with a
code and JSON Pointer (empty string for the root). JSON-level failures may carry
half-open UTF-16 offsets. Unknown field names are omitted from diagnostics.
Success returns a fresh recursively frozen value.

This result describes contract validity only. Renderer support, Trusted
Admission, Apply and production readiness are separate. This module is not
wired to Schema v3, Workspace, network ingress or a provider.
