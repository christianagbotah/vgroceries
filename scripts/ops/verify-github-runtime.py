#!/usr/bin/env python3
"""Read-only verification of an exact GitHub Release runtime package.

Download all five release assets from the trusted repository first. This tool
does not extract archives, install software, change services or authorize
deployment. Supply version, commit and archive digest from the trusted release
record independently of the downloaded files.
"""
import argparse
import hashlib
import pathlib
import posixpath
import re
import tarfile

ASSETS = {"runtime.tar.gz", "source-sha.txt", "version.txt", "format.txt"}
MAX_BYTES = 2 * 1024**3
MAX_MEMBERS = 200_000
ROOTS = {"storefront", "api"}
REQUIRED_FILES = {
    "storefront/server.js",
    "api/apps/api/dist/src/main.js",
    "api/apps/api/package.json",
    "api/packages/contracts/package.json",
}
REQUIRED_DIRS = {"storefront", "storefront/.next/static", "api", "api/apps/api/node_modules", "api/apps/api/prisma/migrations", "api/packages/contracts/dist"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def validate(directory, sha, version, archive_digest):
    require(re.fullmatch(r"[0-9a-f]{40}", sha), "invalid expected commit")
    require(re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?", version), "invalid expected version")
    require(re.fullmatch(r"[0-9a-f]{64}", archive_digest), "invalid trusted archive digest")
    require(directory.is_dir() and not directory.is_symlink(), "invalid asset directory")
    for name in ASSETS | {"SHA256SUMS"}:
        p = directory / name
        require(p.is_file() and not p.is_symlink(), "missing or unsafe asset: " + name)
        require(p.stat().st_size <= (MAX_BYTES if name == "runtime.tar.gz" else 4096), "oversized asset: " + name)
    manifest = {}
    for line in (directory / "SHA256SUMS").read_text(encoding="ascii").splitlines():
        m = re.fullmatch(r"([0-9a-f]{64}) [ *]([A-Za-z0-9.-]+)", line)
        require(m is not None, "invalid checksum entry")
        value, name = m.groups()
        require(name in ASSETS and name not in manifest, "unexpected or duplicate checksum entry")
        manifest[name] = value
    require(set(manifest) == ASSETS, "incomplete checksum manifest")
    require(manifest["runtime.tar.gz"] == archive_digest, "archive digest differs from trusted release record")
    for name in sorted(ASSETS):
        require(digest(directory / name) == manifest[name], "checksum mismatch: " + name)
    for name, expected in {"source-sha.txt": sha, "version.txt": version, "format.txt": "vgroceries-runtime-v1"}.items():
        require((directory / name).read_text(encoding="ascii") == expected + "\n", "identity mismatch: " + name)

    members = {}
    links = {}
    total = 0
    with tarfile.open(directory / "runtime.tar.gz", "r:gz") as archive:
        for member in archive:
            raw = member.name
            name = posixpath.normpath(raw)
            parts = name.split("/")
            require(raw == name or (member.isdir() and raw == name + "/"), "noncanonical archive path")
            require(parts[0] in ROOTS and all(p not in ("", ".", "..") for p in parts), "archive path escapes runtime roots")
            require(name not in members, "duplicate archive path")
            require(len(members) < MAX_MEMBERS, "archive entry limit exceeded")
            require(member.isfile() or member.isdir() or member.issym(), "unsupported archive member type")
            require(not member.mode & 0o6000, "privileged archive mode")
            require(not any(p in (".git", ".env") or p.startswith(".env.") or p.endswith((".pem", ".key", ".p12", ".pfx")) for p in parts), "credential-like archive path")
            total += member.size
            require(total <= MAX_BYTES, "expanded archive exceeds size limit")
            members[name] = member
            if member.issym():
                target = member.linkname
                require(not target.startswith("/") and bool(target), "absolute or empty symbolic link")
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
                require(resolved.split("/")[0] == parts[0], "symbolic link escapes component")
                links[name] = resolved

    for name in members:
        parent = posixpath.dirname(name)
        while parent:
            require(parent in members and members[parent].isdir(), "archive entry has missing or non-directory parent")
            parent = posixpath.dirname(parent)
    # Resolve any symbolic links encountered in target prefixes, not just the
    # final member. Reject cycles, dangling links and cross-component chains.
    def resolve(name):
        root = name.split("/")[0]
        visited = set()
        for _ in range(64):
            require(name not in visited, "symbolic link cycle")
            visited.add(name)
            parts = name.split("/")
            for i in range(1, len(parts) + 1):
                prefix = "/".join(parts[:i])
                if prefix in links:
                    name = posixpath.normpath(posixpath.join(links[prefix], *parts[i:]))
                    require(name.split("/")[0] == root, "symbolic link chain escapes component")
                    break
            else:
                require(name in members and not members[name].issym(), "dangling symbolic link")
                return
        raise ValueError("symbolic link chain exceeds limit")

    for name in links:
        resolve(name)
    for name in REQUIRED_FILES:
        require(name in members and members[name].isfile(), "missing runtime file: " + name)
    for name in REQUIRED_DIRS:
        require(name in members and members[name].isdir(), "missing runtime directory: " + name)
    return len(members), total


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=pathlib.Path)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--archive-sha256", required=True)
    args = parser.parse_args()
    try:
        count, total = validate(args.assets, args.sha, args.version, args.archive_sha256)
    except (OSError, ValueError, tarfile.TarError) as exc:
        parser.exit(1, "REJECTED: " + str(exc) + "\n")
    print("VERIFIED:", args.version, args.sha, "entries=" + str(count), "expanded_bytes=" + str(total))
    print("Read-only preflight passed; deployment and runtime acceptance are separate gates.")


if __name__ == "__main__":
    main()
