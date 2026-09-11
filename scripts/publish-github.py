"""Publish the public site files to GitHub Pages without exposing credentials."""
import base64
import json
import os
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
REPO = "wjjjjjjjjjjj/shangji-bond"
PUBLIC_FILES = ("index.html", "styles.css", "app.js", "favicon.svg", "data.json", ".nojekyll", "CNAME")


def normalized_text(content: bytes) -> bytes:
    """Compare/upload text with stable LF endings across Windows and Pages."""
    return content.replace(b"\n", b"\n")


def gh_path() -> Path:
    candidate = ROOT / "tools" / "bin" / "gh.exe"
    if candidate.exists():
        return candidate
    return Path("gh")


def gh(*args: str, input_text: str | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    # The scheduled task runs from a writable staging directory while the
    # local GitHub CLI profile is kept one level above it, outside ``dist``.
    config_candidates = (ROOT / ".gh-config", ROOT.parent / ".gh-config", DIST / ".gh-config")
    if "GH_CONFIG_DIR" not in env:
        for config in config_candidates:
            if config.exists():
                env["GH_CONFIG_DIR"] = str(config)
                break
    result = subprocess.run(
        [str(gh_path()), *args],
        input=input_text,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    if check and result.returncode:
        # Keep stderr out of normal logs because gh may include request details.
        endpoint = next((arg for arg in args if arg.startswith("repos/")), "GitHub API")
        raise RuntimeError(f"gh api failed ({result.returncode}) for {endpoint}")
    return result


def remote_file(path: str):
    result = gh("api", f"repos/{REPO}/contents/{path}?ref=main", check=False)
    if result.returncode:
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid GitHub response for {path}") from exc


def put_file(path: str, content: bytes, sha: str | None) -> str:
    payload = {
        "message": f"Update public procurement data ({path})",
        "content": base64.b64encode(content).decode("ascii"),
        "branch": "main",
    }
    if sha:
        payload["sha"] = sha
    result = gh(
        "api",
        "--method",
        "PUT",
        f"repos/{REPO}/contents/{path}",
        "--input",
        "-",
        input_text=json.dumps(payload, ensure_ascii=False),
    )
    try:
        return json.loads(result.stdout)["commit"]["sha"]
    except (json.JSONDecodeError, KeyError) as exc:
        raise RuntimeError(f"invalid commit response for {path}") from exc


def pages_status():
    result = gh("api", f"repos/{REPO}/pages")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("invalid GitHub Pages response") from exc


def wait_for_pages(timeout_seconds: int = 180):
    deadline = time.time() + timeout_seconds
    latest = pages_status()
    while time.time() < deadline:
        build = gh("api", f"repos/{REPO}/pages/builds/latest")
        try:
            latest_build = json.loads(build.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError("invalid GitHub Pages build response") from exc
        status = latest_build.get("status")
        if status == "built":
            latest = pages_status()
            if latest.get("status") == "built":
                return latest
        if status in {"errored", "null"}:
            raise RuntimeError("GitHub Pages build failed")
        time.sleep(5)
    raise RuntimeError("GitHub Pages build did not finish in time")


def main() -> int:
    changed = []
    commits = []
    for rel in PUBLIC_FILES:
        source = DIST / rel
        if not source.is_file():
            raise RuntimeError(f"missing public file: {rel}")
        content = source.read_bytes()
        remote = remote_file(rel)
        if remote:
            encoded = remote.get("content") or ""
            remote_bytes = base64.b64decode(encoded) if encoded else b""
            if normalized_text(remote_bytes) == normalized_text(content):
                continue
        sha = remote.get("sha") if remote else None
        commits.append(put_file(rel, normalized_text(content), sha))
        changed.append(rel)

    if changed:
        pages = wait_for_pages()
    else:
        pages = pages_status()
    print(json.dumps({
        "updated": changed,
        "commits": commits,
        "pagesStatus": pages.get("status"),
        "url": pages.get("html_url"),
        "httpsEnforced": pages.get("https_enforced"),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
