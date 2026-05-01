#!/usr/bin/env python3
# SP-016 §4.1 정량 임계 (a)(b)(c)(d) 자동 측정
# (e) leveldb 50만 entry / (f) B2 오프로드는 본 범위 외
# 옵션 C SeaweedFS 자가호스팅 검증, 세션 77

import hashlib
import os
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

LOG_PATH = Path("/home/smart/seaweedfs/logs/progress.txt")
PAYLOAD_PATH = Path("/home/smart/seaweedfs/test-src/payload.bin")
FILER_BASE = "http://127.0.0.1:8888"
TOTAL_FILES = 500
PAYLOAD_BYTES = 100 * 1024 * 1024  # 100MB

PROGRESS = []


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    PROGRESS.append(line)
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text("\n".join(PROGRESS) + "\n")


def md5_of(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        while True:
            chunk = f.read(4 * 1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def http_put(url: str, src: Path) -> int:
    """curl PUT, return HTTP status code or -1 on error."""
    proc = subprocess.run(
        [
            "curl", "-s", "-o", "/dev/null",
            "-w", "%{http_code}",
            "-X", "PUT",
            "-T", str(src),
            url,
        ],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        return -1
    try:
        return int(proc.stdout.strip())
    except ValueError:
        return -1


def http_get(url: str, dst: Path) -> int:
    proc = subprocess.run(
        [
            "curl", "-s", "-o", str(dst),
            "-w", "%{http_code}",
            url,
        ],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        return -1
    try:
        return int(proc.stdout.strip())
    except ValueError:
        return -1


def get_weed_pid() -> int | None:
    proc = subprocess.run(
        ["pgrep", "-f", "weed server"],
        capture_output=True, text=True,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    return int(proc.stdout.strip().splitlines()[0])


def get_rss_mb(pid: int) -> float:
    try:
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    kb = int(line.split()[1])
                    return kb / 1024.0
    except OSError:
        return -1.0
    return -1.0


def main() -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    PAYLOAD_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Pre-step: 100MB payload 생성 + md5
    log("preparing 100MB payload from /dev/zero")
    with PAYLOAD_PATH.open("wb") as out, open("/dev/zero", "rb") as src:
        remaining = PAYLOAD_BYTES
        block = 4 * 1024 * 1024
        while remaining > 0:
            n = min(block, remaining)
            out.write(src.read(n))
            remaining -= n
    payload_md5 = md5_of(PAYLOAD_PATH)
    log(f"payload md5={payload_md5} size={PAYLOAD_BYTES}")

    # (a) 50GB throughput
    log(f"starting PUT 100MB x {TOTAL_FILES} = {TOTAL_FILES * 100 / 1024:.1f}GB load")
    put_start = time.monotonic()
    success, fail = 0, 0
    for i in range(1, TOTAL_FILES + 1):
        url = f"{FILER_BASE}/test/file-{i}.bin"
        code = http_put(url, PAYLOAD_PATH)
        if code in (200, 201, 204):
            success += 1
        else:
            fail += 1
            if fail <= 5:
                log(f"  PUT {i} FAILED http={code}")
        if i % 50 == 0:
            elapsed = time.monotonic() - put_start
            mb_done = i * 100
            mbps = mb_done / elapsed if elapsed > 0 else 0
            log(f"progress {i}/{TOTAL_FILES} elapsed={elapsed:.1f}s throughput={mbps:.2f}MB/s success={success} fail={fail}")
    put_elapsed = time.monotonic() - put_start
    total_mb = success * 100
    throughput_a = total_mb / put_elapsed if put_elapsed > 0 else 0
    log(
        f"PUT_DONE success={success} fail={fail} total={total_mb}MB "
        f"elapsed={put_elapsed:.1f}s throughput_a={throughput_a:.2f}MB/s "
        f"go_threshold=50MB/s"
    )

    # (b) Memory 측정
    pid = get_weed_pid()
    if pid:
        rss_mb = get_rss_mb(pid)
        log(f"memory_b: weed_pid={pid} rss={rss_mb:.1f}MB go_threshold=<1024MB")
    else:
        log("memory_b: weed_pid not found")
        rss_mb = -1

    # (d) 무결성 5/500 sample
    log("integrity check (5/500 sample: 1, 100, 250, 400, 500)")
    integrity_pass = 0
    for i in [1, 100, 250, 400, 500]:
        dst = Path(f"/tmp/check-{i}.bin")
        url = f"{FILER_BASE}/test/file-{i}.bin"
        code = http_get(url, dst)
        if code != 200:
            log(f"  integrity file-{i}: FAIL http={code}")
            continue
        try:
            check_md5 = md5_of(dst)
            check_size = dst.stat().st_size
            ok = (check_md5 == payload_md5) and (check_size == PAYLOAD_BYTES)
            if ok:
                integrity_pass += 1
                log(f"  integrity file-{i}: OK md5={check_md5} size={check_size}")
            else:
                log(f"  integrity file-{i}: FAIL md5={check_md5} size={check_size} expected={payload_md5}")
        finally:
            try:
                dst.unlink()
            except FileNotFoundError:
                pass
    log(f"integrity_d: {integrity_pass}/5 pass go_threshold=5/5")

    # (c) SIGKILL → PM2 auto-restart → filer port 복귀
    if pid:
        log(f"restart test: SIGKILL weed_pid={pid}")
        restart_start = time.monotonic()
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError as e:
            log(f"  kill failed: {e}")
        attempts = 0
        max_wait = 240  # 4분 cap
        while attempts < max_wait:
            try:
                proc = subprocess.run(
                    ["curl", "-s", "--max-time", "1", FILER_BASE],
                    capture_output=True, timeout=2,
                )
                if proc.returncode == 0:
                    break
            except subprocess.TimeoutExpired:
                pass
            attempts += 1
            time.sleep(1)
        restart_elapsed = time.monotonic() - restart_start
        log(
            f"restart_c: {restart_elapsed:.1f}s attempts={attempts} "
            f"go_threshold=<120s"
        )

        # 재시작 후 무결성 1건 (file-250)
        time.sleep(3)
        dst = Path("/tmp/restart-check.bin")
        url = f"{FILER_BASE}/test/file-250.bin"
        code = http_get(url, dst)
        if code == 200:
            check_md5 = md5_of(dst)
            check_size = dst.stat().st_size
            if check_md5 == payload_md5 and check_size == PAYLOAD_BYTES:
                log("restart_integrity: OK (file-250 readable post-restart)")
            else:
                log(f"restart_integrity: FAIL md5={check_md5} size={check_size}")
            dst.unlink(missing_ok=True)
        else:
            log(f"restart_integrity: FAIL http={code}")

    # Cleanup payload
    PAYLOAD_PATH.unlink(missing_ok=True)
    log("DONE all measurements complete")


if __name__ == "__main__":
    main()
