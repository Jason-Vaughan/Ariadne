#!/bin/bash
# Publish the Ariadne public roadmap and sprint reports directly to GitHub Pages (gh-pages branch -> https://jason-vaughan.github.io/Ariadne/).
set -eu

DIR="/Users/jasonvaughan/Documents/Projects/Ariadne-PM/roadmap-board"
REPORTS_DIR="/Users/jasonvaughan/Documents/Projects/Ariadne-PM/sprint-reports"
SOURCE="$DIR/Ariadne-Public-Roadmap-preview.html"
STATUS="$DIR/roadmap-sync-status.json"
REMOTE="${ARIADNE_GIT_REMOTE:-https://github.com/Jason-Vaughan/Ariadne.git}"
BRANCH="gh-pages"

python3 "$DIR/build-ariadne-roadmap.py"

tmp_dir=$(mktemp -d "/tmp/ariadne-public-roadmap.XXXXXX")
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT

if git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
    git clone --quiet --depth 1 --branch "$BRANCH" "$REMOTE" "$tmp_dir/site"
else
    mkdir "$tmp_dir/site"
    git -C "$tmp_dir/site" init --quiet
    git -C "$tmp_dir/site" checkout --quiet --orphan "$BRANCH"
    git -C "$tmp_dir/site" remote add origin "$REMOTE"
fi

site="$tmp_dir/site"
cp "$SOURCE" "$site/index.html"
cp "$STATUS" "$site/roadmap-sync-status.json"
mkdir -p "$site/reports"
if [ -f "$REPORTS_DIR/index.html" ]; then
    cp "$REPORTS_DIR/index.html" "$site/reports/index.html"
fi
for vdir in "$REPORTS_DIR"/v*; do
    [ -d "$vdir" ] || continue
    ver=$(basename "$vdir")
    if [ -f "$vdir/index.html" ]; then
        mkdir -p "$site/reports/$ver"
        cp "$vdir/index.html" "$site/reports/$ver/index.html"
    fi
done

touch "$site/.nojekyll"
git -C "$site" add -A
if git -C "$site" diff --cached --quiet; then
    echo "Ariadne public roadmap and sprint reports are unchanged; no GitHub commit needed."
    exit 0
fi
git -C "$site" -c user.name="Ariadne Roadmap Publisher" \
    -c user.email="roadmap-publisher@users.noreply.github.com" \
    commit --quiet -m "chore: refresh Ariadne public roadmap and sprint reports"
git -C "$site" push --quiet origin "$BRANCH"
echo "Published Ariadne roadmap and sprint reports to $REMOTE ($BRANCH)."
