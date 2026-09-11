"""
SIH26006: Auto-Sync, Setup, and Live Runner
=====================================================
Automates git fetching/syncing, dependency checks,
bytecode/cache cleanup, and concurrent execution of
both Backend (FastAPI :8000) and Frontend (Vite :5173).

Usage:
    python sync_and_run.py              # Full sync, check dependencies, and launch both servers
    python sync_and_run.py --open       # Launch servers and open in browser
    python sync_and_run.py --no-sync    # Launch directly without git pull
    python sync_and_run.py --sync-only  # Only pull git changes and verify packages without running
    python sync_and_run.py --backend    # Run backend only
    python sync_and_run.py --frontend   # Run frontend only
    python sync_and_run.py --worker     # Run background fleet & market sync worker only
    python sync_and_run.py --test       # Run test suite and exit
    python sync_and_run.py --clean      # Clean cache files only and exit
"""

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

# Allow Python bytecode caching for faster startup
# (Previously disabled, causing full recompilation of all libraries on every restart)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

PROJECT_ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Checks if a local TCP port is already open and listening."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def wait_for_port(port: int, host: str = "127.0.0.1", timeout: float = 10.0) -> bool:
    """Polls until a port starts listening or timeout expires."""
    start = time.time()
    while time.time() - start < timeout:
        if is_port_in_use(port, host):
            return True
        time.sleep(0.3)
    return False


def terminate_process_tree(proc: subprocess.Popen, name: str):
    """Gracefully and completely terminates a process and its child tree."""
    if proc.poll() is not None:
        return
    print(f"   Terminating {name} (PID: {proc.pid})...")
    if os.name == "nt":
        # On Windows, kill the entire process tree (/T) to prevent orphaned node.exe or uvicorn processes
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        except Exception:
            proc.kill()
    else:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


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
    import importlib.util

    required = ["fastapi", "pandas", "uvicorn", "xgboost", "src", "yfinance", "pandas_datareader"]
    if not all(importlib.util.find_spec(pkg) is not None for pkg in required):
        print("⚙️ Installing/Updating Python package in editable mode...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-e", "."], cwd=PROJECT_ROOT, check=True)
        print("✅ Python package successfully installed.")
    else:
        print("✅ Python core dependencies and 'src' package are installed.")


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


def run_servers(run_backend=True, run_frontend=True, auto_open=False):
    """Launches backend and/or frontend processes concurrently."""
    processes = []
    print("\n" + "=" * 60)
    print("🚀 LAUNCHING SIH26006 FREIGHT INTELLIGENCE PLATFORM")
    print("=" * 60)

    # Pre-flight check for port availability — reuse healthy running instances
    if run_backend and is_port_in_use(8000):
        try:
            import urllib.request
            req = urllib.request.Request("http://127.0.0.1:8000/api/v1/health")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    print("🟢 An existing backend is already active and healthy on port 8000. Reusing active instance.")
                    run_backend = False
        except Exception:
            print("⚠️  Notice: Port 8000 is currently in use. An existing backend instance may already be active.")

    if run_frontend and is_port_in_use(5173):
        try:
            import urllib.request
            req = urllib.request.Request("http://127.0.0.1:5173/")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    print("🟢 An existing frontend is already active on port 5173. Reusing active instance.")
                    run_frontend = False
        except Exception:
            print("⚠️  Notice: Port 5173 is currently in use. An existing frontend instance may already be active.")

    try:
        if run_backend:
            print("🔹 Backend starting on:  http://localhost:8000")
            print("🔹 API Documentation at: http://localhost:8000/docs")
            backend_cmd = [
                sys.executable, "-m", "uvicorn",
                "src.api.main:app",
                "--host", "0.0.0.0",
                "--port", "8000",
                "--timeout-keep-alive", "75",
                "--reload",
                "--reload-dir", "src",
            ]
            p_back = subprocess.Popen(backend_cmd, cwd=PROJECT_ROOT, env=os.environ)
            processes.append(("Backend", p_back))

        if run_frontend:
            print("🔹 Frontend starting on: http://localhost:5173")
            frontend_cmd = ["npm", "run", "dev"]
            p_front = subprocess.Popen(frontend_cmd, cwd=FRONTEND_DIR, shell=True)
            processes.append(("Frontend", p_front))

        # Readiness polling
        if run_backend:
            if wait_for_port(8000, timeout=25.0):
                print("🟢 Backend is ready and listening on port 8000.")
        if run_frontend:
            if wait_for_port(5173, timeout=25.0):
                print("🟢 Frontend is ready and listening on port 5173.")

        if auto_open:
            target_url = "http://localhost:5173" if run_frontend else "http://localhost:8000/docs"
            print(f"🌐 Opening {target_url} in your default browser...")
            webbrowser.open(target_url)

        print("\n✨ All requested services started! Press Ctrl+C to stop all servers gracefully.\n")

        # Keep parent script running and monitor child processes
        while True:
            time.sleep(1)
            for name, proc in processes:
                if proc.poll() is not None:
                    print(f"⚠️ {name} stopped unexpectedly (exit code {proc.returncode}).")
                    return

    except KeyboardInterrupt:
        print("\n\n🛑 Stopping all services...")
    finally:
        for name, proc in processes:
            terminate_process_tree(proc, name)
        clean_pycache()
        print("👋 All services stopped cleanly.")


def main():
    parser = argparse.ArgumentParser(description="SIH26006 Auto-Sync, Setup, and Server Runner")
    parser.add_argument("--no-sync", action="store_true", help="Skip Git remote sync")
    parser.add_argument("--sync-only", action="store_true", help="Perform sync and dependency verification only, do not launch servers")
    parser.add_argument("--backend", action="store_true", help="Run backend server only")
    parser.add_argument("--frontend", action="store_true", help="Run frontend server only")
    parser.add_argument("--open", action="store_true", help="Automatically open application in default web browser once ready")
    parser.add_argument("--worker", action="store_true", help="Run background fleet & market sync worker only")
    parser.add_argument("--test", action="store_true", help="Run test suite and exit")
    parser.add_argument("--clean", action="store_true", help="Clean cache files only and exit")

    args = parser.parse_args()

    clean_pycache()

    if args.clean:
        print("✅ Cache cleanup complete.")
        return

    if args.test:
        print("\n🧪 Running test suite...")
        res = subprocess.run([sys.executable, "-m", "pytest", "tests/"], cwd=PROJECT_ROOT)
        sys.exit(res.returncode)

    if args.worker:
        print("\n🔄 Launching standalone Background Fleet & Market Worker...")
        res = subprocess.run([sys.executable, "-m", "src.data.background_worker"], cwd=PROJECT_ROOT)
        sys.exit(res.returncode)

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

    run_servers(run_backend=run_back, run_frontend=run_front, auto_open=args.open)


if __name__ == "__main__":
    main()
