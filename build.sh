#!/usr/bin/env sh
# artifact.html is the source of truth: it is the body-only form that Claude Artifacts
# requires (no doctype/html/head/body of its own). This wraps it into a standalone
# document for GitHub Pages. Run after any edit to artifact.html.
set -eu
cd "$(dirname "$0")"
{
  cat <<'HTML'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Learn all 50 US states on a real map: study modes for location and letter groups, plus quizzes on shapes, capitals, postal codes and borders.">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#E7EAE4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0F1412" media="(prefers-color-scheme: dark)">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%97%BA%3C/text%3E%3C/svg%3E">
<style>img{max-width:100%}[hidden]{display:none!important}</style>
HTML
  cat artifact.html
  printf '</html>\n'
} > index.html
printf 'built index.html (%s bytes) from artifact.html\n' "$(wc -c < index.html | tr -d ' ')"
