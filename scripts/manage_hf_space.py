import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, Optional


BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILES = (BASE_DIR / ".env", BASE_DIR / ".env.local")


def _load_env_file(path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key:
            values[key] = value
    return values


def _get_env_value(name: str) -> Optional[str]:
    value = os.getenv(name, "").strip()
    if value:
        return value
    for env_file in ENV_FILES:
        file_values = _load_env_file(env_file)
        if file_values.get(name):
            return file_values[name].strip()
    return None


def _require_hf_api():
    try:
        from huggingface_hub import HfApi
    except Exception as error:
        raise SystemExit(
            "huggingface_hub is not installed in this environment. "
            "Run `npm run hf:install` first."
        ) from error
    return HfApi


def _resolve_repo_id(explicit_repo_id: Optional[str]) -> str:
    repo_id = (
        explicit_repo_id
        or _get_env_value("HF_SPACE_REPO_ID")
        or _get_env_value("HUGGINGFACE_SPACE_REPO_ID")
        or ""
    ).strip()
    if repo_id:
        return repo_id
    raise SystemExit(
        "No Space repo id configured. Set HF_SPACE_REPO_ID in .env.local "
        "or pass --repo-id owner/space-name."
    )


def _get_token() -> Optional[str]:
    return (
        _get_env_value("HF_TOKEN")
        or _get_env_value("HUGGINGFACEHUB_API_TOKEN")
        or _get_env_value("HUGGING_FACE_HUB_TOKEN")
    )


def _print_json(payload) -> None:
    print(json.dumps(payload, indent=2, default=str))


def handle_whoami(_args: argparse.Namespace) -> int:
    HfApi = _require_hf_api()
    api = HfApi(token=_get_token())
    _print_json(api.whoami())
    return 0


def handle_status(args: argparse.Namespace) -> int:
    HfApi = _require_hf_api()
    api = HfApi(token=_get_token())
    repo_id = _resolve_repo_id(args.repo_id)
    runtime = api.get_space_runtime(repo_id=repo_id)
    payload = {
        "repo_id": repo_id,
        "stage": getattr(runtime, "stage", None),
        "hardware": getattr(runtime, "hardware", None),
        "requested_hardware": getattr(runtime, "requested_hardware", None),
        "sleep_time": getattr(runtime, "sleep_time", None),
        "raw": runtime.raw if hasattr(runtime, "raw") else None,
    }
    _print_json(payload)
    return 0


def _restart_space(repo_id: str, factory_reboot: bool) -> int:
    HfApi = _require_hf_api()
    api = HfApi(token=_get_token())
    runtime = api.restart_space(repo_id=repo_id, factory_reboot=factory_reboot)
    payload = {
        "repo_id": repo_id,
        "factory_reboot": factory_reboot,
        "stage": getattr(runtime, "stage", None),
        "hardware": getattr(runtime, "hardware", None),
        "requested_hardware": getattr(runtime, "requested_hardware", None),
        "sleep_time": getattr(runtime, "sleep_time", None),
        "raw": runtime.raw if hasattr(runtime, "raw") else None,
    }
    _print_json(payload)
    return 0


def handle_restart(args: argparse.Namespace) -> int:
    repo_id = _resolve_repo_id(args.repo_id)
    return _restart_space(repo_id, factory_reboot=False)


def handle_factory_reboot(args: argparse.Namespace) -> int:
    repo_id = _resolve_repo_id(args.repo_id)
    return _restart_space(repo_id, factory_reboot=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manage the Hugging Face Space used by this repo."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    whoami = subparsers.add_parser("whoami", help="Show the authenticated HF account.")
    whoami.set_defaults(func=handle_whoami)

    status = subparsers.add_parser("status", help="Show Space runtime status.")
    status.add_argument("--repo-id", help="Space repo id, e.g. owner/space-name")
    status.set_defaults(func=handle_status)

    restart = subparsers.add_parser("restart", help="Restart the Space.")
    restart.add_argument("--repo-id", help="Space repo id, e.g. owner/space-name")
    restart.set_defaults(func=handle_restart)

    reboot = subparsers.add_parser(
        "factory-reboot",
        help="Factory reboot the Space and clear cached runtime state.",
    )
    reboot.add_argument("--repo-id", help="Space repo id, e.g. owner/space-name")
    reboot.set_defaults(func=handle_factory_reboot)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
