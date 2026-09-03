#!/usr/bin/env python3
"""Merge Telegram-related keys into a .env body (stdin → stdout). Patch path: argv[1] JSON."""

from __future__ import annotations

import json
import re
import sys


def parse_env_paths(paths: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    order = []
    for path in paths:
        try:
            raw = open(path, encoding="utf-8").read()
        except OSError:
            continue
        for line in raw.splitlines():
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            order.append(k)
            out[k] = v
    return out


def pick_local(repo_root: str) -> dict[str, str]:
    """Prefer .env.local over .env (same idea as sync script)."""
    paths = [
        f"{repo_root}/.env.local",
        f"{repo_root}/.env",
    ]
    merged = parse_env_paths(paths)
    picked: dict[str, str] = {}
    for path in paths:
        for line in open(path, encoding="utf-8", errors="ignore").readlines():
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, _ = s.split("=", 1)
            k = k.strip()
            if k in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_HTTPS_PROXY"):
                picked[k] = merged.get(k, "")
    return picked


def esc_env_value(val: str) -> str:
    return val.replace("\\", "\\\\").replace('"', '\\"')


def line_for(k: str, v: str) -> str:
    return f'{k}="{esc_env_value(v)}"\n'


def strip_key(line: str) -> str | None:
    line = line.split("\n", 1)[0]
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=", line)
    return m.group(1) if m else None


def merge(remote_body: str, patch: dict[str, str]) -> str:
    lines = remote_body.splitlines(keepends=True)
    patch_keys = set(patch.keys())
    written: set[str] = set()
    out: list[str] = []

    for line in lines:
        k = strip_key(line)
        if k and k in patch_keys:
            v = patch[k]
            if str(v).strip() == "":
                out.append(line)
            else:
                out.append(line_for(k, str(v)))
                written.add(k)
        else:
            out.append(line)

    trailing_nl = remote_body.endswith("\n") if remote_body else True
    for k in patch_keys:
        if k in written:
            continue
        v = patch.get(k)
        if v is None or str(v).strip() == "":
            continue
        if not trailing_nl and out and not str(out[-1]).endswith("\n"):
            out.append("\n")
        out.append(line_for(k, str(v)))
        trailing_nl = True

    return "".join(out)


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: merge_telegram_env.py <patch.json> < remote.env > out.env", file=sys.stderr)
        sys.exit(1)
    patch = json.load(open(sys.argv[1], encoding="utf-8"))
    remote = sys.stdin.read()
    sys.stdout.write(merge(remote, patch))


if __name__ == "__main__":
    main()
