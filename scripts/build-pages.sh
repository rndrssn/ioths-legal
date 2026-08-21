#!/bin/sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(dirname -- "$script_directory")
output_directory="$repository_root/dist"

mkdir -p "$output_directory/de"
find "$output_directory" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
mkdir -p "$output_directory/de"

cp "$repository_root/index.html" "$output_directory/index.html"
cp "$repository_root/terms.html" "$output_directory/terms.html"
cp "$repository_root/contact.html" "$output_directory/contact.html"
cp "$repository_root/contact.html" "$output_directory/support.html"
sed \
  -e 's|href="index\.html"|href="https://legal.bedrockrebel.app/"|g' \
  -e 's|href="terms\.html"|href="https://legal.bedrockrebel.app/terms.html"|g' \
  -e 's|href="impressum\.html"|href="https://legal.bedrockrebel.app/impressum.html"|g' \
  "$output_directory/support.html" > "$output_directory/support.html.tmp"
mv "$output_directory/support.html.tmp" "$output_directory/support.html"
cp "$repository_root/impressum.html" "$output_directory/impressum.html"
cp "$repository_root/style.css" "$output_directory/style.css"
cp "$repository_root/_headers" "$output_directory/_headers"
cp "$repository_root/_redirects" "$output_directory/_redirects"
cp "$repository_root/de/index.html" "$output_directory/de/index.html"
cp "$repository_root/de/terms.html" "$output_directory/de/terms.html"
