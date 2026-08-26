"""
SIH26006: Auto-Sync, Setup, and Live Runner
=====================================================
Automates git fetching/syncing, dependency checks,
bytecode/cache cleanup, and concurrent execution of
both Backend (FastAPI :8000) and Frontend (React :3000).

Usage:
    python sync_and_run.py              # Full sync, check dependencies, and launch both servers
    python sync_and_run.py --no-sync    # Launch directly without git pull
    python sync_and_run.py --sync-only  # Only pull git changes and verify packages without running
    python sync_and_run.py --backend    # Run backend only
    python sync_and_run.py --frontend   # Run frontend only
"""

import os
import sys
import shutil
import subprocess
import argparse
import time
from pathlib import Path

# Enforce no bytecode generation in this process and all child processes
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

PROJECT_ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"


def clean_pycache():
    """Recursively removes all __pycache__ and .pyc files."""
    cleaned = 0
    for p in PROJECT_ROOT.rglob("__pycache__"):
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
            cleaned += 1
    for p in PROJECT_ROOT.rglob("*.py[cod]"):
        if p.is_file():
            p.unlink(missing_ok=True)
            cleaned += 1
    if cleaned > 0:
        print(f"🧹 Cleaned {cleaned} cache artifacts.")


def git_sync():
    """Fetches and pulls the latest changes from git remote repository."""
    print("\n📦 Checking for remote Git updates...")
    git_dir = PROJECT_ROOT / ".git"
    if not git_dir.exists():
        print("ℹ️ No .git repository detected. Skipping git sync.")
        return

    try:
        # Check if git is available
        subprocess.run(["git", "--version"], check=True, capture_output=True, timeout=5)
        
        # Fetch remote changes
        fetch_res = subprocess.run(["git", "fetch", "--all"], cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=10)
        if fetch_res.returncode == 0:
            print("✅ Git fetch completed.")
        
        # Check if behind remote
        status_res = subprocess.run(["git", "status", "-uno"], cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=5)
        if "Your branch is behind" in status_res.stdout:
            print("⬇️ Remote changes found. Pulling latest code...")
            pull_res = subprocess.run(["git", "pull", "--rebase"], cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=15)
            print(pull_res.stdout)
        else:
            print("✨ Local repository is already up to date.")
    except Exception as e:
        print(f"⚠️ Git sync notice: {e}. Continuing with local files...")


def verify_python_environment():
    """Verifies that the package and its requirements are installed."""
    print("\n🐍 Verifying Python packages...")
    try:
        import fastapi
        import xgboost
        import pandas
        import uvicorn
        import src
        print("✅ Python core dependencies and 'src' package are installed.")
    except ImportError:
        print("⚙️ Installing/Updating Python package in editable mode...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-e", "."], cwd=PROJECT_ROOT, check=True)
        print("✅ Python package successfully installed.")


def verify_frontend_environment():
    """Verifies that frontend node_modules are installed."""
    print("\n⚛️ Verifying Frontend dependencies...")
    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists() or not any(node_modules.iterdir()):
        print("⚙️ Running 'npm install' in frontend directory...")
        subprocess.run(["npm", "install"], cwd=FRONTEND_DIR, shell=True, check=True)
        print("✅ Frontend dependencies installed.")
    else:
        print("✅ Frontend node_modules verified.")


def run_servers(run_backend=True, run_frontend=True):
    """Launches backend and/or frontend processes concurrently."""
    processes = []
    print("\n" + "=" * 60)
    print("🚀 LAUNCHING SIH26006 FREIGHT INTELLIGENCE PLATFORM")
    print("=" * 60)

    try:
        if run_backend:
            print("🔹 Backend starting on:  http://localhost:8000")
            print("🔹 API Documentation at: http://localhost:8000/docs")
            backend_cmd = [
                sys.executable, "-B", "-m", "uvicorn",
                "src.api.main:app",
                "--host", "0.0.0.0",
                "--port", "8000",
                "--reload"
            ]
            p_back = subprocess.Popen(backend_cmd, cwd=PROJECT_ROOT, env=os.environ)
            processes.append(("Backend", p_back))

        if run_frontend:
            print("🔹 Frontend starting on: http://localhost:5173")
            frontend_cmd = ["npm", "run", "dev"]
            p_front = subprocess.Popen(frontend_cmd, cwd=FRONTEND_DIR, shell=True)
            processes.append(("Frontend", p_front))

        print("\n✨ All services started! Press Ctrl+C to stop all servers gracefully.\n")

        # Keep parent script running and monitor child processes
        while True:
            time.sleep(1)
            for name, proc in processes:
                if proc.poll() is not None:
                    print(f"⚠️ {name} stopped unexpectedly (exit code {proc.returncode}).")
                    break

    except KeyboardInterrupt:
        print("\n\n🛑 Stopping all services...")
    finally:
        for name, proc in processes:
            print(f"   Terminating {name}...")
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
        clean_pycache()
        print("👋 All services stopped cleanly.")


def main():
    parser = argparse.ArgumentParser(description="SIH26006 Auto-Sync, Setup, and Server Runner")
    parser.add_argument("--no-sync", action="store_true", help="Skip Git remote sync")
    parser.add_argument("--sync-only", action="store_true", help="Perform sync and dependency verification only, do not launch servers")
    parser.add_argument("--backend", action="store_true", help="Run backend server only")
    parser.add_argument("--frontend", action="store_true", help="Run frontend server only")
    parser.add_argument("--clean", action="store_true", help="Clean cache files only and exit")

    args = parser.parse_args()

    clean_pycache()

    if args.clean:
        print("✅ Cache cleanup complete.")
        return

    if not args.no_sync:
        git_sync()

    verify_python_environment()
    verify_frontend_environment()

    if args.sync_only:
        print("\n🎉 Sync and dependency verification complete!")
        return

    # Determine which servers to run
    run_back = True
    run_front = True
    if args.backend and not args.frontend:
        run_front = False
    elif args.frontend and not args.backend:
        run_back = False

    run_servers(run_backend=run_back, run_frontend=run_front)


if __name__ == "__main__":
    main()
