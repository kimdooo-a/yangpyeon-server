import { NextResponse } from "next/server";
import os from "os";
import { execFileSync } from "child_process";

function getCpuUsage(): number {
  try {
    // /proc/stat 기반 CPU 사용률 (쉘 파이프 제거)
    const output = execFileSync("cat", ["/proc/stat"], {
      encoding: "utf-8",
      timeout: 3000,
    });
    const cpuLine = output.split("\n").find((l) => l.startsWith("cpu "));
    if (!cpuLine) throw new Error("no cpu line");
    const values = cpuLine.split(/\s+/).slice(1).map(Number);
    const idle = values[3];
    const total = values.reduce((a, b) => a + b, 0);
    return total > 0 ? ((total - idle) / total) * 100 : 0;
  } catch {
    const cpus = os.cpus();
    const avg = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return acc + ((total - cpu.times.idle) / total) * 100;
    }, 0);
    return avg / cpus.length;
  }
}

interface DiskInfo {
  mount: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

function getDisks(): DiskInfo[] {
  const disks: DiskInfo[] = [];
  try {
    const output = execFileSync("df", ["-B1", "/mnt/c", "/mnt/e", "/"], {
      encoding: "utf-8",
      timeout: 3000,
    });
    const seen = new Set<string>();
    const lines = output.trim().split("\n").slice(1); // 헤더 제거
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const mount = parts[5];
      const device = parts[0];
      if (seen.has(device)) continue;
      seen.add(device);
      const total = parseInt(parts[1], 10);
      const used = parseInt(parts[2], 10);
      const free = parseInt(parts[3], 10);
      // 마운트 포인트를 읽기 쉬운 이름으로
      let label = mount;
      if (mount === "/mnt/c") label = "C:";
      else if (mount === "/mnt/e") label = "E:";
      else if (mount === "/") label = "WSL2";
      disks.push({ mount: label, total, used, free, percent: total > 0 ? (used / total) * 100 : 0 });
    }
  } catch {
    // 폴백: 루트만
    try {
      const raw = execFileSync("df", ["-B1", "/"], { encoding: "utf-8", timeout: 3000 });
      const output = raw.trim().split("\n").pop() ?? "";
      const parts = output.trim().split(/\s+/);
      const total = parseInt(parts[1], 10);
      const used = parseInt(parts[2], 10);
      const free = parseInt(parts[3], 10);
      disks.push({ mount: "/", total, used, free, percent: (used / total) * 100 });
    } catch {
      // 무시
    }
  }
  return disks;
}

export async function GET() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const data = {
    cpu: {
      model: cpus[0]?.model?.trim() ?? "알 수 없음",
      cores: cpus.length,
      usage: getCpuUsage(),
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percent: (usedMem / totalMem) * 100,
    },
    disks: getDisks(),
    uptime: os.uptime(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    nodeVersion: process.version,
    time: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
  };

  return NextResponse.json(data);
}
