#!/bin/sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(dirname -- "$script_directory")
output_directory="$repository_root/dist"

mkdir -p "$output_directory"
find "$output_directory" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
mkdir -p "$output_directory/legal/de"

cp "$repository_root/index.html" "$output_directory/index.html"
cp "$repository_root/support.html" "$output_directory/support.html"
cp "$repository_root/style.css" "$output_directory/style.css"
cp "$repository_root/_headers" "$output_directory/_headers"
cp "$repository_root/_redirects" "$output_directory/_redirects"
cp "$repository_root/favicon-16x16.png" "$output_directory/favicon-16x16.png"
cp "$repository_root/favicon-32x32.png" "$output_directory/favicon-32x32.png"
cp "$repository_root/apple-touch-icon.png" "$output_directory/apple-touch-icon.png"
cp "$repository_root/icon-why.png" "$output_directory/icon-why.png"
cp "$repository_root/legal/privacy.html" "$output_directory/legal/privacy.html"
cp "$repository_root/legal/terms.html" "$output_directory/legal/terms.html"
cp "$repository_root/legal/impressum.html" "$output_directory/legal/impressum.html"
cp "$repository_root/legal/de/privacy.html" "$output_directory/legal/de/privacy.html"
cp "$repository_root/legal/de/terms.html" "$output_directory/legal/de/terms.html"
