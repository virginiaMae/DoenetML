#!/usr/bin/env python3
"""Mirror a Doenet folder (recursively) down into a local directory tree.

The inverse of upload_to_doenet.py: Doenet is the source of truth here.
Walks the content tree starting at OWNER_ID/ROOT_ID, recreating each `folder`
as a local directory and saving each document's DoenetML source as a
`<name>.doenet` file. Safe to re-run: files whose content already matches are
left untouched (no needless git diffs), so an interrupted run just resumes.

Non-`folder`/non-document content types (e.g. `sequence`, `select` -- items
that don't expose a plain DoenetML source) are reported and skipped rather
than aborting the whole run.

Auth is the doenet.org browser session cookie -- same as upload_to_doenet.py:
    export DOENET_COOKIE='connect.sid=s%3A....'

Usage:
    python3 download_from_doenet.py --url https://doenet.org/activities/<OWNER_ID>/<ROOT_ID> --dest ./local/folder --dry-run
    python3 download_from_doenet.py --owner <OWNER_ID> --root <ROOT_ID> --dest ./local/folder
    python3 download_from_doenet.py --url ... --dest ./local/folder --prune
"""

import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request

BASE = "https://doenet.org"
READ_DELAY = 0.05
RETRIES = 2

COOKIE_HELP = """
Could not authenticate against doenet.org.

Set DOENET_COOKIE to your doenet.org session cookie:
  1. Log in to https://doenet.org in your browser
  2. DevTools -> Application -> Cookies -> https://doenet.org
  3. Copy the value of `connect.sid`
  4. export DOENET_COOKIE='connect.sid=s%3A....'
"""

URL_RE = re.compile(r"doenet\.org/activities/([^/]+)/([^/?#]+)")

_ILLEGAL_NAME_CHARS = re.compile(r'[\/\\:*?"<>|]')


class ApiError(Exception):
    pass


def natural_key(s):
    """Sort key that orders `Section 2` before `Section 10`."""
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", s)]


def sanitize_name(name):
    """Make a Doenet content name safe to use as a local file/dir name."""
    cleaned = _ILLEGAL_NAME_CHARS.sub("-", name.strip())
    cleaned = cleaned.rstrip(" .")
    return cleaned or "untitled"


def _request(method, path):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Cookie", os.environ.get("DOENET_COOKIE", ""))
    req.add_header("Accept", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        raise ApiError(f"{method} {path} -> HTTP {e.code}: {detail}") from None
    except urllib.error.URLError as e:
        raise ApiError(f"{method} {path} -> {e.reason}") from None

    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise ApiError(f"{method} {path} -> non-JSON response: {raw[:300]}") from None


def api(method, path):
    for attempt in range(RETRIES + 1):
        try:
            result = _request(method, path)
            time.sleep(READ_DELAY)
            return result
        except ApiError:
            if attempt == RETRIES:
                raise
            time.sleep(1.5 * (attempt + 1))


def list_children(owner_id, parent_id):
    """Return [{name, contentId, type}, ...] for the children of `parent_id`."""
    result = api("GET", f"/api/contentList/getMyContent/{owner_id}/{parent_id}")
    if isinstance(result, dict) and result.get("notMe"):
        raise ApiError(
            "Doenet returned `notMe` -- the session cookie belongs to a "
            f"different user than owner {owner_id}."
        )
    return result.get("content", [])


def get_source(content_id):
    r = api("GET", f"/api/activityEditView/getContentSource/{content_id}")
    return r.get("source") or ""


def check_auth(owner_id, root_id):
    if not os.environ.get("DOENET_COOKIE"):
        sys.exit(COOKIE_HELP)
    try:
        list_children(owner_id, root_id)
    except ApiError as e:
        msg = str(e)
        if "HTTP 403" in msg or "notMe" in msg or "HTTP 401" in msg:
            sys.exit(f"{msg}\n{COOKIE_HELP}")
        raise


def dedupe_local_name(name, taken):
    """Disambiguate two Doenet siblings that share a name (uniqueness isn't
    enforced server-side, but a local directory can't hold two entries with
    the same name)."""
    if name not in taken:
        taken.add(name)
        return name
    n = 2
    while f"{name} ({n})" in taken:
        n += 1
    unique = f"{name} ({n})"
    taken.add(unique)
    return unique


def mirror(owner_id, local_dir, remote_id, dry_run, prune, counts, unsupported, depth=0):
    children = list_children(owner_id, remote_id)

    taken_names = set()
    expected_local = set()  # entries this remote folder accounts for, for --prune

    if not dry_run:
        os.makedirs(local_dir, exist_ok=True)

    for child in sorted(children, key=lambda c: natural_key(c["name"].strip())):
        raw_name = child["name"].strip()
        content_id = child["contentId"]
        content_type = child.get("type")
        local_name = dedupe_local_name(sanitize_name(raw_name), taken_names)

        if content_type == "folder":
            expected_local.add(local_name)
            sub_dir = os.path.join(local_dir, local_name)
            print(f"{'  ' * depth}[folder] {raw_name}")
            mirror(owner_id, sub_dir, content_id, dry_run, prune, counts, unsupported, depth + 1)
            continue

        file_name = f"{local_name}.doenet"
        expected_local.add(file_name)

        indent = "  " * (depth + 1)

        try:
            source = get_source(content_id)
        except ApiError as e:
            unsupported.append(f"{local_dir}/{raw_name} ({content_type}): {e}")
            print(f"{indent}SKIP  {raw_name}  ({content_type}: {e})")
            continue

        dest_path = os.path.join(local_dir, file_name)
        existed = os.path.isfile(dest_path)
        current = None
        if existed:
            with open(dest_path, encoding="utf-8") as fh:
                current = fh.read()

        if existed and current == source:
            counts["identical"] += 1
            continue

        label = "UPDATE" if existed else "CREATE"
        print(f"{indent}{label}  {raw_name}")
        counts["updated" if existed else "created"] += 1
        if not dry_run:
            with open(dest_path, "w", encoding="utf-8") as fh:
                fh.write(source)

    if prune and os.path.isdir(local_dir):
        for entry in os.listdir(local_dir):
            if entry in expected_local:
                continue
            full = os.path.join(local_dir, entry)
            is_dir = os.path.isdir(full)
            if not is_dir and not entry.endswith(".doenet"):
                continue  # leave unrelated files (README, .git, etc.) alone
            indent = "  " * (depth + 1)
            print(f"{indent}{'WOULD DELETE' if dry_run else 'DELETE'}  {entry}")
            counts["pruned"] += 1
            if not dry_run:
                shutil.rmtree(full) if is_dir else os.remove(full)


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--url", help="activity URL: https://doenet.org/activities/<OWNER_ID>/<ROOT_ID>")
    ap.add_argument("--owner", help="Doenet owner id (ignored if --url given)")
    ap.add_argument("--root", help="Doenet folder/content id to start from (ignored if --url given)")
    ap.add_argument("--dest", required=True, help="local directory to mirror into (created if missing)")
    ap.add_argument("--dry-run", action="store_true", help="report only, change nothing")
    ap.add_argument(
        "--prune",
        action="store_true",
        help="delete local .doenet files/folders that no longer exist remotely "
        "(only within directories this run visits)",
    )
    args = ap.parse_args()

    if args.url:
        m = URL_RE.search(args.url)
        if not m:
            sys.exit(f"Couldn't parse owner/root id out of --url: {args.url!r}")
        owner_id, root_id = m.group(1), m.group(2)
    elif args.owner and args.root:
        owner_id, root_id = args.owner, args.root
    else:
        sys.exit("Provide either --url, or both --owner and --root")

    check_auth(owner_id, root_id)

    counts = {"created": 0, "updated": 0, "identical": 0, "pruned": 0}
    unsupported = []

    mirror(owner_id, args.dest, root_id, args.dry_run, args.prune, counts, unsupported)

    prefix = "(dry run) " if args.dry_run else ""
    print()
    print("=" * 60)
    print(f"{prefix}Documents: {counts['created']} created, {counts['updated']} updated, "
          f"{counts['identical']} identical")
    if args.prune:
        verb = "would be pruned" if args.dry_run else "pruned"
        print(f"{prefix}{counts['pruned']} local entr{'y' if counts['pruned'] == 1 else 'ies'} {verb}")
    if unsupported:
        print(f"\n{len(unsupported)} item(s) skipped (no plain DoenetML source):")
        for u in unsupported:
            print(f"  - {u}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
