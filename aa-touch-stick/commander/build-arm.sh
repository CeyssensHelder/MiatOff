#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Run on x86-64 Linux, or in a Linux container with curl, tar and bzip2.
set -eu
cd "$(dirname "$0")"
toolchain=armv7-eabihf--musl--stable-2020.02-2
archive="$toolchain.tar.bz2"
digest=d36fca2c4e80debfb9f2e63a66aab1b4345502ce951324e695bec5589df19b62
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fSL --retry 2 -o "$work/$archive" \
    "https://toolchains.bootlin.com/downloads/releases/toolchains/armv7-eabihf/tarballs/$archive"
printf '%s  %s\n' "$digest" "$archive" | (cd "$work" && sha256sum -c -)
tar -xf "$work/$archive" -C "$work"
"$work/$toolchain/bin/arm-linux-gcc" -std=c99 -Os -Wall -Wextra -Werror -static -s \
    -mcpu=cortex-a9 -Wl,--build-id=none -o "$work/miatoff-commander" dialog.c
cp "$work/miatoff-commander" ../stick/miatoff-commander
sha256sum ../stick/miatoff-commander
