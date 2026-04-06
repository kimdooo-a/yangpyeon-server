import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/layout/shell";
import { CommandMenu } from "@/components/command-menu";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "양평 부엌 서버",
  description: "서버 관리 대시보드",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={cn("font-sans", geist.variable)}>
      <body className="flex h-screen overflow-hidden relative bg-surface-100 text-foreground">
        <Shell>{children}</Shell>
        <CommandMenu />
        <Toaster
          theme="light"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#FFFFFF",
              border: "1px solid #E2DDD4",
              color: "#1A1815",
            },
          }}
        />
      </body>
    </html>
  );
}
