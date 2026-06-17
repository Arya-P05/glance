#!/usr/bin/env python3
"""
Resolve Instagram post/reel targets to image URL + caption using Instaloader.

Input (stdin JSON): {"targets":[{"shortcode":"DWRd7OqjFVd","kind":"p"}]}
Output (stdout JSON): {"items":[{"shortcode":"...","kind":"p","media_index":1,"media_count":1,"image_url":"...","caption":"..."}]}
"""
import json
import os
import sys


def apply_instagram_cookies(loader) -> None:
    session = getattr(loader.context, "_session", None)
    if session is None:
        return

    sessionid = os.environ.get("INSTAGRAM_SESSIONID", "").strip()
    if sessionid:
        session.cookies.set("sessionid", sessionid, domain=".instagram.com", path="/")

    cookies_path = os.environ.get("INSTAGRAM_COOKIES_PATH", "").strip()
    if not cookies_path:
        return

    try:
        with open(cookies_path, "r", encoding="utf-8") as fh:
            cookies = json.load(fh)
    except Exception as e:
        raise RuntimeError(f"Could not read INSTAGRAM_COOKIES_PATH: {e}") from e

    if not isinstance(cookies, list):
        raise RuntimeError("INSTAGRAM_COOKIES_PATH must point to a JSON array of cookies")

    for cookie in cookies:
        if not isinstance(cookie, dict):
            continue
        name = str(cookie.get("name", "")).strip()
        value = str(cookie.get("value", "")).strip()
        if not name or not value:
            continue
        domain = str(cookie.get("domain", "")).strip() or ".instagram.com"
        path = str(cookie.get("path", "")).strip() or "/"
        session.cookies.set(name, value, domain=domain, path=path)


def main() -> int:
    try:
        import instaloader  # type: ignore
    except Exception:
        print(json.dumps({"error": "Missing Python package 'instaloader'. Install with: pip3 install instaloader"}))
        return 2

    raw = sys.stdin.read() or "{}"
    try:
        payload = json.loads(raw)
    except Exception:
        print(json.dumps({"error": "Invalid JSON input"}))
        return 1

    targets = payload.get("targets") or []
    if not isinstance(targets, list):
        print(json.dumps({"error": "targets must be an array"}))
        return 1

    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        quiet=True,
    )
    try:
        apply_instagram_cookies(loader)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return 1

    items = []
    for t in targets[:50]:
        shortcode = str(t.get("shortcode", "")).strip()
        kind = "reel" if str(t.get("kind", "p")).lower() == "reel" else "p"
        if not shortcode:
            continue
        try:
            post = instaloader.Post.from_shortcode(loader.context, shortcode)
            image_url = None
            caption = post.caption if hasattr(post, "caption") else None

            if post.typename == "GraphSidecar":
                nodes = []
                try:
                    nodes = list(post.get_sidecar_nodes())
                except Exception:
                    nodes = []

                if not nodes:
                    items.append({"shortcode": shortcode, "kind": kind, "error": "No media in carousel"})
                    continue

                media_count = len(nodes)
                for idx, node in enumerate(nodes, start=1):
                    image_url = getattr(node, "display_url", None)
                    if not image_url:
                        continue
                    items.append(
                        {
                            "shortcode": shortcode,
                            "kind": kind,
                            "media_index": idx,
                            "media_count": media_count,
                            "image_url": image_url,
                            "caption": caption,
                        }
                    )
                continue

            image_url = getattr(post, "url", None)
            if not image_url:
                items.append({"shortcode": shortcode, "kind": kind, "error": "No media URL"})
                continue

            items.append(
                {
                    "shortcode": shortcode,
                    "kind": kind,
                    "media_index": 1,
                    "media_count": 1,
                    "image_url": image_url,
                    "caption": caption,
                }
            )
        except Exception as e:
            items.append({"shortcode": shortcode, "kind": kind, "error": str(e)})

    print(json.dumps({"items": items}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
