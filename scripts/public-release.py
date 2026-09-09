#!/usr/bin/env python3
"""Export an allowlisted working snapshot and audit public files or staged blobs.

No Git history is copied. JSON diagnostics contain paths and rule identifiers,
never matched content. A clean result is a heuristic gate, not secret clearance.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tomllib

MANIFEST = 'PUBLIC-RELEASE-MANIFEST.json'
# Unmodified upstream Elastic License 2.0, byte for byte:
# https://raw.githubusercontent.com/elastic/elasticsearch/main/licenses/ELASTIC-LICENSE-2.0.txt
ELV2_SHA256 = '48255018b41fc0e965b1115af7e6779bc218bb8a6747d561da800d5022622aa2'
ROOT_FILES = {
    'README.md', 'LICENSE', 'NOTICE', 'LICENSING', 'Cargo.toml', 'Cargo.lock',
    'package.json', 'bun.lock', 'Makefile', 'Dockerfile.api', 'Dockerfile.runner',
    'docker-compose.prod.yml', '.dockerignore', '.gitignore', '.gitleaks.toml',
    '.env.example', '.env.production.example', MANIFEST,
}
EXACT_FILES = {
    'scripts/public-release.py', 'scripts/test-public-release.py',
    'scripts/migrations-rehash.sh', 'scripts/probe-connectors.sh',
    'scripts/smoke-prod.sh', 'scripts/measure-api.py',
    '.github/workflows/ci.yml', '.github/workflows/public-release.yml',
    '.github/public-release-policy.json', 'deploy/sandbox/Caddyfile',
    'crates/appcall-web/CONTRACT.md',
    'third_party/anusa-sdk-go', 'third_party/anusa-sdk-go-NOTICE',
}
REQUIRED_THIRD_PARTY = {
    'third_party/NOTICE', 'third_party/anusa-sdk-go-NOTICE',
    'third_party/licenses/archivo-LICENSE.txt',
    'third_party/licenses/ibm-plex-mono-LICENSE.txt',
    *(f'third_party/licenses/{name}-LICENSE' for name in
      ('anusa-sdk-go', 'datastar', 'tailwindcss', 'activepieces')),
}
EXACT_FILES |= REQUIRED_THIRD_PARTY
SIGNAL_FONTS = {
    'crates/appcall-web/static/fonts/archivo-latin-variable.woff2': '8f704806dbedeaaeca334b11ec348bc3ac3a439d6431544b3afb54f534ee4967',
    'crates/appcall-web/static/fonts/ibm-plex-mono-variable.woff2': 'ef55d69e81baa6523a9b6e015d746e707bc7e9579f18703a169cb18c36dd567b',
}
EXACT_FILES |= SIGNAL_FONTS.keys()

DENIED_PARTS = {
    '.git', '.agents', '.codex', '.claude', '.githooks', 'node_modules',
    'target', '__pycache__', '.cache', 'coverage', 'reports', 'docs',
    'enterprise', 'private', 'internal-notes', '.idea', '.vscode',
}
DENIED_NAMES = {'agents.md', 'claude.md', 'rules.md', 'factory.md', '.mcp.json',
                'go.mod', 'go.sum', 'go.work', 'go.work.sum', 'atlas.sum'}
SOURCE_SUFFIXES = {
    'crates': {'.rs', '.toml', '.html', '.css', '.js', '.json', '.sql', '.svg'},
    'runner': {'.ts', '.json', '.xml', '.ics', '.txt'},
    'migrations': {'.sql'},
}
SECRET_RULES = {
    'private-key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'credential-token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|sk_live_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{20,})\b'),
    'credential-assignment': re.compile(r'''(?im)^\s*["']?(?:api[_-]?key|client[_-]?secret|password|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']?([A-Za-z0-9+/=_-]{24,})'''),
    'ai-attribution': re.compile(r'(?i)(?:generated|written|authored|co-authored|coauthored)\s+(?:with|by)\s+(?:chatgpt|claude|codex|openai|anthropic)\b' + r'|co-' + r'authored-by:\s*[^\n]*(?:claude|codex|chatgpt|noreply@openai\.com)'),
}
LEGAL_PLACEHOLDER = re.compile(r'(?i)\[(?:year|owner|name|copyright holder|your[^\]]*)\]|\b(?:TODO|TBD|FIXME|YOUR_COMPANY|YOUR_NAME|LEGAL_OWNER_PENDING)\b|<[^>]*(?:owner|holder|year)[^>]*>')


def issue(path, rule):
    return {'path': str(path), 'rule': rule}


def allowed(path):
    p = PurePosixPath(path)
    if not path or p.is_absolute() or '\\' in path or any(x in ('', '.', '..') for x in path.split('/')):
        return False
    parts = [x.lower() for x in p.parts]
    if any(x in DENIED_PARTS for x in parts) or parts[-1] in DENIED_NAMES:
        return False
    if any(x.startswith('.env') for x in parts) and path not in {'.env.example', '.env.production.example'}:
        return False
    if path in ROOT_FILES or path in EXACT_FILES:
        return True
    if p.suffix.lower() in {'.md', '.markdown', '.mdown'}:
        return path == 'README.md'
    if any(x.startswith('.') for x in p.parts):
        return False
    if path.startswith('scripts/connector-gen/'):
        return p.suffix == '.ts'
    if path.startswith('third_party/licenses/'):
        return p.name in {'LICENSE', 'NOTICE', 'COPYING'} or p.suffix == '.txt'
    return len(p.parts) > 1 and p.suffix in SOURCE_SUFFIXES.get(p.parts[0], set())


def filesystem_files(source, exporting):
    files, errors = {}, []
    for directory, dirs, names in os.walk(source, followlinks=False):
        relative = Path(directory).relative_to(source)
        for name in list(dirs):
            path = relative / name
            full = source / path
            if exporting and name.lower() == 'enterprise':
                errors.append(issue(path, 'enterprise-license-review-required'))
                dirs.remove(name)
            elif exporting and name.lower() in DENIED_PARTS:
                dirs.remove(name)
            elif full.is_symlink():
                errors.append(issue(path, 'symlink'))
                dirs.remove(name)
            elif name == '.git' and relative == Path('.'):
                dirs.remove(name)
            elif exporting and name.lower() in DENIED_PARTS:
                dirs.remove(name)
        for name in names:
            path = (relative / name).as_posix()
            full = source / path
            if exporting and name.lower() == 'enterprise':
                errors.append(issue(path, 'enterprise-license-review-required'))
                continue
            if path == '.git' or exporting and name.lower() in DENIED_PARTS:
                continue
            mode = full.lstat().st_mode
            if stat.S_ISLNK(mode):
                errors.append(issue(path, 'symlink'))
            elif not stat.S_ISREG(mode):
                errors.append(issue(path, 'non-regular-file'))
            elif allowed(path):
                files[path] = full.read_bytes()
            elif not exporting:
                errors.append(issue(path, 'path-not-allowed'))
    return files, errors


def index_files(source):
    files, errors = {}, []
    listing = subprocess.run(['git', '-C', str(source), 'ls-files', '--stage', '-z'], check=True, capture_output=True).stdout
    for record in listing.split(b'\0'):
        if not record:
            continue
        header, raw_path = record.split(b'\t', 1)
        mode, oid, stage = header.decode().split()
        path = raw_path.decode('utf-8', errors='strict')
        if stage != '0':
            errors.append(issue(path, 'unmerged-index'))
        elif mode not in ('100644', '100755'):
            errors.append(issue(path, 'non-regular-index-entry'))
        elif not allowed(path):
            errors.append(issue(path, 'path-not-allowed'))
        else:
            files[path] = subprocess.run(['git', '-C', str(source), 'cat-file', 'blob', oid], check=True, capture_output=True).stdout
    return files, errors


def inventory(files):
    return {path: hashlib.sha256(data).hexdigest() for path, data in sorted(files.items()) if path != MANIFEST}


def audit(files):
    """Return release-policy violations for a mapping of paths to file bytes.

    Pinned SHA256 values validate allowlisted fonts; they bypass UTF-8 and
    secret-content checks. A mismatched binary is reported as a violation.
    """
    errors = []
    exceptions = {}
    policy_path = '.github/public-release-policy.json'
    if policy_path in files:
        try:
            policy = json.loads(files[policy_path])
            if set(policy) != {'version', 'reviewed_fixture_exceptions'} or policy['version'] != 1:
                raise ValueError()
            for entry in policy['reviewed_fixture_exceptions']:
                path = entry['path']
                if (set(entry) != {'path', 'sha256', 'rules', 'reason'}
                        or not allowed(path) or '/test/' not in path and '/fixtures/' not in path
                        or not re.fullmatch('[0-9a-f]{64}', entry['sha256'])
                        or not entry['reason'].strip()
                        or not entry['rules']
                        or any(rule not in {'credential-token', 'credential-assignment'} for rule in entry['rules'])
                        or path in exceptions):
                    raise ValueError()
                exceptions[path] = entry
                if path not in files or hashlib.sha256(files[path]).hexdigest() != entry['sha256']:
                    errors.append(issue(path, 'fixture-exception-hash-mismatch'))
        except (ValueError, KeyError, TypeError, AttributeError):
            errors.append(issue(policy_path, 'invalid-exception-policy'))
    for path, data in sorted(files.items()):
        if path in SIGNAL_FONTS:
            if hashlib.sha256(data).hexdigest() != SIGNAL_FONTS[path]:
                errors.append(issue(path, 'font-asset-hash-mismatch'))
            continue
        try:
            content = data.decode('utf-8')
        except UnicodeError:
            errors.append(issue(path, 'non-text-file'))
            continue
        if '\x00' in content:
            errors.append(issue(path, 'binary-content'))
        for rule, pattern in SECRET_RULES.items():
            if pattern.search(content):
                exception = exceptions.get(path, {})
                if not (rule in exception.get('rules', []) and exception.get('sha256') == hashlib.sha256(data).hexdigest()):
                    errors.append(issue(path, rule))
        if path in {'LICENSE', 'NOTICE', 'LICENSING'} and LEGAL_PLACEHOLDER.search(content):
            errors.append(issue(path, 'legal-placeholder'))
    for required in sorted(REQUIRED_THIRD_PARTY):
        if required not in files or not files[required].strip():
            errors.append(issue(required, 'third-party-license-missing'))
    for path, data in files.items():
        if path in {'scripts/public-release.py', 'scripts/test-public-release.py'}:
            continue
        content = data.decode('utf-8', errors='replace')
        image_or_import = re.search(
            r'(?i)arigaio/atlas|ariga\.io/atlas|atlasgo\.sh|release\.ariga\.io|'
            r'(?:Command::new|spawn|exec|execFile|execSync)\s*\(\s*[\"\']atlas[\"\']',
            content,
        )
        build_file = (path.startswith('.github/workflows/') or path.startswith('Dockerfile')
                      or path == 'Makefile' or path.endswith('.sh'))
        build_tool = build_file and re.search(r'(?i)\batlas\b|ATLAS_(?:IMAGE|BIN|VERSION)', content)
        if image_or_import or build_tool:
            errors.append(issue(path, 'atlas-dependency-forbidden'))
    for required in ('LICENSE', 'NOTICE', 'LICENSING', 'README.md', 'Cargo.toml', 'package.json'):
        if required not in files or not files[required].strip():
            errors.append(issue(required, 'required-file-missing'))
    if hashlib.sha256(files.get('LICENSE', b'')).hexdigest() != ELV2_SHA256:
        errors.append(issue('LICENSE', 'elastic-license-hash-mismatch'))
    notice = files.get('NOTICE', b'')
    if b'AppCall by Meosu' not in notice or b'Copyright' not in notice:
        errors.append(issue('NOTICE', 'required-attribution-missing'))
    try:
        cargo = tomllib.loads(files.get('Cargo.toml', b'').decode())
        if cargo.get('workspace', {}).get('package', {}).get('license') != 'Elastic-2.0':
            errors.append(issue('Cargo.toml', 'license-metadata-missing'))
        for path, data in files.items():
            if path.startswith('crates/') and path.endswith('/Cargo.toml'):
                package = tomllib.loads(data.decode()).get('package', {})
                if package.get('license') not in ('Elastic-2.0', {'workspace': True}):
                    errors.append(issue(path, 'license-metadata-missing'))
        if json.loads(files.get('package.json', b'{}')).get('license') != 'Elastic-2.0':
            errors.append(issue('package.json', 'license-metadata-missing'))
    except (ValueError, UnicodeError):
        errors.append(issue('Cargo.toml/package.json', 'invalid-license-metadata'))
    if MANIFEST in files:
        try:
            manifest = json.loads(files[MANIFEST])
            if manifest != {'version': 1, 'files': inventory(files)}:
                errors.append(issue(MANIFEST, 'manifest-mismatch'))
        except (ValueError, UnicodeError):
            errors.append(issue(MANIFEST, 'invalid-manifest'))
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('export', 'check'))
    parser.add_argument('--source', type=Path, default=Path.cwd())
    parser.add_argument('--destination', type=Path)
    parser.add_argument('--index', action='store_true', help='Check staged Git blobs, independent of ignore rules/worktree content')
    args = parser.parse_args()
    source = args.source.resolve()
    errors = []
    if args.command == 'export':
        if args.index or not args.destination:
            parser.error('export requires --destination and does not accept --index')
        destination = args.destination.absolute()
        resolved = destination.resolve()
        if destination.exists() or destination.is_symlink():
            errors.append(issue(destination, 'destination-must-be-new'))
        if resolved == source or source in resolved.parents:
            errors.append(issue(destination, 'destination-inside-source'))
        if any(parent.is_symlink() for parent in destination.parents if parent.exists()):
            # macOS /tmp is a standard alias; use its canonical path explicitly.
            errors.append(issue(destination, 'destination-symlink-parent'))
    if not source.is_dir():
        errors.append(issue(source, 'source-directory-missing'))
    if errors:
        print(json.dumps({'ok': False, 'errors': errors}, sort_keys=True))
        return 1
    files, errors = index_files(source) if args.index else filesystem_files(source, args.command == 'export')
    errors.extend(audit(files))
    if not errors and args.command == 'export':
        files.pop(MANIFEST, None)
        destination.mkdir(parents=False, exist_ok=False)
        for path, data in sorted(files.items()):
            target = destination / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            if (source / path).stat().st_mode & stat.S_IXUSR:
                target.chmod(0o755)
        (destination / MANIFEST).write_text(json.dumps({'version': 1, 'files': inventory(files)}, indent=2, sort_keys=True) + '\n')
        final_files, final_errors = filesystem_files(destination, False)
        errors.extend(final_errors + audit(final_files))
    print(json.dumps({'ok': not errors, 'errors': errors, 'files': inventory(files)}, sort_keys=True))
    return int(bool(errors))


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, subprocess.CalledProcessError, UnicodeError, ValueError):
        print(json.dumps({'ok': False, 'errors': [issue('.', 'io-or-git-error')]}))
        sys.exit(1)
