// src/app/admin/aggregator/sources/new-source-dialog.tsx
// 신규 소스 추가 Dialog (클라이언트). server action `createSource` 호출.
//
// kind enum (대문자 RSS|HTML|API|FIRECRAWL) — schema-additions.prisma:40.
// asChild 패턴은 yangpyeon Button/DialogTrigger가 미지원이라 제거하고
//   controlled Dialog 패턴(open + setOpen)을 단순 trigger Button + onClick으로 사용.

"use client";

import { useRef, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { createSource } from "./actions";

const TRACKS = ["hustle", "work", "build", "invest", "learn", "community"];

export function NewSourceDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <Button
        className="bg-emerald-600 text-white hover:bg-emerald-500"
        onClick={() => setOpen(true)}
      >
        + 신규 소스 추가
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>신규 소스 추가</DialogTitle>
            <DialogDescription className="text-zinc-400">
              RSS / HTML 셀렉터 / 외부 API / Firecrawl 중 하나를 등록합니다.
            </DialogDescription>
          </DialogHeader>

          <form
            ref={formRef}
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                try {
                  await createSource(formData);
                  setOpen(false);
                  formRef.current?.reset();
                } catch (e) {
                  setError((e as Error).message);
                }
              });
            }}
            className="grid grid-cols-1 gap-3 md:grid-cols-2"
          >
            <Field label="slug (영문 식별자)" htmlFor="slug">
              <Input id="slug" name="slug" required placeholder="ai-news-bench" />
            </Field>
            <Field label="이름 (한국어 가능)" htmlFor="name">
              <Input id="name" name="name" required placeholder="AI 뉴스 벤치" />
            </Field>
            <Field label="URL" htmlFor="url" className="md:col-span-2">
              <Input id="url" name="url" required placeholder="https://example.com/feed" />
            </Field>
            <Field label="종류" htmlFor="kind">
              <Select name="kind" defaultValue="RSS">
                <SelectTrigger id="kind" className="border-zinc-700 bg-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900">
                  <SelectItem value="RSS">RSS / Atom</SelectItem>
                  <SelectItem value="HTML">HTML 셀렉터</SelectItem>
                  <SelectItem value="API">외부 API (JSON)</SelectItem>
                  <SelectItem value="FIRECRAWL">Firecrawl 폴백</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="기본 트랙" htmlFor="defaultTrack">
              <Select name="defaultTrack" defaultValue="build">
                <SelectTrigger id="defaultTrack" className="border-zinc-700 bg-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900">
                  {TRACKS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="국가 (ISO-3166)" htmlFor="country">
              <Input id="country" name="country" placeholder="KR" defaultValue="KR" />
            </Field>
            <Field label="활성화" htmlFor="active">
              <div className="flex items-center gap-2">
                <Checkbox id="active" name="active" defaultChecked />
                <span className="text-sm text-zinc-400">즉시 수집 시작</span>
              </div>
            </Field>
            <Field
              label="parserConfig (JSON)"
              htmlFor="parserConfig"
              className="md:col-span-2"
              hint='RSS는 비워두기, HTML은 {"selector":"article", "title":"h2"} 형태'
            >
              <Textarea
                id="parserConfig"
                name="parserConfig"
                rows={5}
                className="border-zinc-700 bg-zinc-900 font-mono text-xs"
                defaultValue="{}"
              />
            </Field>

            {error ? (
              <p className="md:col-span-2 rounded border border-rose-800 bg-rose-950/50 p-2 text-sm text-rose-300">
                {error}
              </p>
            ) : null}

            <DialogFooter className="md:col-span-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                취소
              </Button>
              <Button type="submit" disabled={pending} className="bg-emerald-600 hover:bg-emerald-500">
                {pending ? "저장 중…" : "저장"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  htmlFor,
  children,
  hint,
  className,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <Label htmlFor={htmlFor} className="text-zinc-300">
        {label}
      </Label>
      {children}
      {hint ? <span className="text-xs text-zinc-500">{hint}</span> : null}
    </div>
  );
}
