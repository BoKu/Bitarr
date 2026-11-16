# Contributing to Bitarr

Thanks for helping. Bitarr is a custom application based on
[qBittorrent](https://github.com/qbittorrent/qBittorrent).

## Reporting bugs and asking for features

Use the [issue templates](https://github.com/BoKu/Bitarr/issues/new/choose). Questions about using
Bitarr belong in [Discussions](https://github.com/BoKu/Bitarr/discussions).

## Building

See the "Building" section of the [README](README.md).

## Opening a pull request

- Keep each pull request to one topic and describe how you tested it.
- Follow [CODING_GUIDELINES.md](CODING_GUIDELINES.md) for C++ and the guidance in
  `src/webui/www/CODING_GUIDELINES.md` for WebUI code.
- User-visible text should say "Bitarr". Technical identifiers inherited from qBittorrent (for example the
  User-Agent and the Lua plugin namespace) are kept on purpose; ask before changing them.
- The desktop app is C++/Qt and stays C++ for now. The WebUI is plain HTML, CSS and JavaScript with no
  build step and no third-party libraries; please keep it that way.

## Licence

By contributing you agree that your work is licensed under the same terms as the project: GPL version 2 or
(at your option) any later version, with the OpenSSL exception described in [COPYING](COPYING).
