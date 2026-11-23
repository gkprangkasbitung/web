"use client";

import { Loader2Icon, SearchIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeUsername, usernameError, usulkanUsername } from "@/lib/portal-username";

import { PasswordTable, PrintSlipsButton, SHOWN_ONCE, type SlipAccount } from "./password-slips";

/** A jemaat that can get an account: not linked to one yet. */
export type EligibleJemaat = { id: string; nama: string; labels: readonly string[] };

export type CreateAccountsOutcome = {
  created: (SlipAccount & { jemaatId: string })[];
  failed: { jemaatId: string; nama: string; username: string; error: string }[];
  /** The 207 message, when some failed. */
  warning: string | null;
};

/** Same limit as the server (lib/username-accounts-routes.ts). */
const MAX_BATCH = 50;

type Row = { jemaatId: string; nama: string; username: string };

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("id");
}

/** Suggestions for every selected jemaat, each avoiding the ones before it. */
function suggest(selected: readonly EligibleJemaat[], taken: ReadonlySet<string>): Row[] {
  const used = new Set(taken);
  return selected.map((person) => {
    const username = usulkanUsername(person.nama, used) ?? "";
    if (username) used.add(username);
    return { jemaatId: person.id, nama: person.nama, username };
  });
}

/**
 * "Buat Akun Username" (brief §18.7, stage 14d): pick one or more jemaat
 * without an account, adjust the suggested usernames, create them, then show
 * the temporary passwords once with "Cetak Slip". Remount with a new `key`
 * to reset.
 */
export function CreateUsernameAccountsDialog({
  open,
  onOpenChange,
  people,
  takenUsernames,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: readonly EligibleJemaat[];
  /** Every username in use, lowercase. */
  takenUsernames: ReadonlySet<string>;
  /** Rejects with the message to show inline. */
  onSubmit: (items: { jemaatId: string; username: string }[]) => Promise<CreateAccountsOutcome>;
}) {
  const id = useId();
  const [step, setStep] = useState<"pilih" | "username" | "hasil">("pilih");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CreateAccountsOutcome | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return people;
    return people.filter((p) => normalize(p.nama).includes(q) || p.labels.some((label) => normalize(label).includes(q)));
  }, [people, query]);
  const selected = new Set(selectedIds);
  const full = selectedIds.length >= MAX_BATCH;

  function toggle(personId: string, checked: boolean) {
    setSelectedIds((ids) =>
      checked ? (ids.includes(personId) || ids.length >= MAX_BATCH ? ids : [...ids, personId]) : ids.filter((x) => x !== personId),
    );
  }

  function goToUsernames() {
    if (selectedIds.length === 0) {
      setError("Pilih minimal satu jemaat.");
      return;
    }
    const byId = new Map(people.map((p) => [p.id, p]));
    setRows(suggest(selectedIds.map((pid) => byId.get(pid)!).filter(Boolean), takenUsernames));
    setError(null);
    setStep("username");
  }

  /** Per-row problems: format, reserved, already used, or used twice in this batch. */
  const rowErrors = rows.map((row, index) => {
    const value = normalizeUsername(row.username);
    const format = usernameError(value);
    if (format) return format;
    if (takenUsernames.has(value)) return "Username ini sudah dipakai akun lain.";
    if (rows.findIndex((other) => normalizeUsername(other.username) === value) !== index) {
      return "Username ini sudah dipakai di baris lain.";
    }
    return null;
  });

  async function create() {
    if (rowErrors.some(Boolean)) {
      setError("Perbaiki username yang ditandai dulu.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await onSubmit(rows.map((row) => ({ jemaatId: row.jemaatId, username: normalizeUsername(row.username) })));
      setOutcome(result);
      setStep("hasil");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  function requestClose(next: boolean) {
    if (next || pending) return;
    if (step === "hasil" && outcome && outcome.created.length > 0) setConfirmClose(true);
    else onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {step === "hasil" ? "Akun Username Dibuat" : "Buat Akun Username"}
            </DialogTitle>
            <DialogDescription>
              {step === "pilih" &&
                "Pilih jemaat yang belum punya akun. Mereka masuk ke Portal Jemaat dengan username dan password sementara dari slip."}
              {step === "username" &&
                "Periksa usulan username. Huruf kecil a–z, angka, dan titik di antaranya; 3–30 karakter."}
              {step === "hasil" && SHOWN_ONCE}
            </DialogDescription>
          </DialogHeader>

          {step === "pilih" && (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <SearchIcon
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Cari nama atau label jemaat"
                  placeholder="Cari nama atau label..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {selectedIds.length} dipilih
                {full && ` (maksimal ${MAX_BATCH} sekali buat)`}
              </p>
              {people.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Semua jemaat sudah punya akun.</p>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada jemaat yang cocok.</p>
              ) : (
                <ul className="flex max-h-[45vh] flex-col overflow-auto rounded-lg border border-border">
                  {filtered.map((person) => {
                    const checked = selected.has(person.id);
                    return (
                      <li key={person.id} className="border-b border-border last:border-0">
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-60">
                          <Checkbox
                            checked={checked}
                            disabled={!checked && full}
                            onCheckedChange={(value) => toggle(person.id, value === true)}
                          />
                          <span className="flex flex-1 flex-wrap items-center gap-1.5">
                            <span>{person.nama}</span>
                            {person.labels.map((label) => (
                              <Badge key={label} variant="neutral">
                                {label}
                              </Badge>
                            ))}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <FormError id={`${id}-error`} message={error} />
            </div>
          )}

          {step === "username" && (
            <div className="flex flex-col gap-3">
              <ul className="flex max-h-[50vh] flex-col gap-3 overflow-auto">
                {rows.map((row, index) => {
                  const inputId = `${id}-username-${index}`;
                  const rowError = rowErrors[index];
                  return (
                    <li key={row.jemaatId} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_1fr] sm:items-start sm:gap-3">
                      <Label htmlFor={inputId} className="sm:pt-2.5">
                        {row.nama}
                      </Label>
                      <div className="flex flex-col gap-1">
                        <Input
                          id={inputId}
                          value={row.username}
                          onChange={(event) =>
                            setRows((current) =>
                              current.map((r, i) => (i === index ? { ...r, username: event.target.value } : r)),
                            )
                          }
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          className="font-mono"
                          disabled={pending}
                          aria-invalid={Boolean(rowError) || undefined}
                          aria-describedby={rowError ? `${inputId}-error` : undefined}
                        />
                        {rowError && (
                          <p id={`${inputId}-error`} className="text-xs text-destructive">
                            {rowError}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                Kalau username ternyata sudah dipakai saat disimpan, sistem menambahkan angka (2, 3, …) dan menandainya
                &quot;disesuaikan&quot;.
              </p>
              <FormError id={`${id}-error`} message={error} />
            </div>
          )}

          {step === "hasil" && outcome && (
            <div className="flex flex-col gap-3">
              {outcome.created.length > 0 && <PasswordTable accounts={outcome.created} />}
              {outcome.failed.length > 0 && (
                <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">
                  <p className="font-medium text-destructive">{outcome.failed.length} akun gagal dibuat:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {outcome.failed.map((row) => (
                      <li key={row.jemaatId}>
                        {row.nama}: {row.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {step === "pilih" && (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Batal
                </Button>
                <Button onClick={goToUsernames} disabled={selectedIds.length === 0} focusableWhenDisabled>
                  Lanjut ({selectedIds.length})
                </Button>
              </>
            )}
            {step === "username" && (
              <>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    setStep("pilih");
                  }}
                >
                  Kembali
                </Button>
                <Button onClick={create} disabled={pending} focusableWhenDisabled>
                  {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
                  Buat {rows.length} Akun
                </Button>
              </>
            )}
            {step === "hasil" && (
              <>
                <Button variant="outline" onClick={() => requestClose(false)}>
                  Selesai
                </Button>
                {outcome && outcome.created.length > 0 && <PrintSlipsButton accounts={outcome.created} />}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Tutup daftar password sementara?"
        description="Setelah ditutup, password sementara tidak bisa ditampilkan lagi. Kalau slip belum dicetak, password akun tersebut harus direset."
        confirmLabel="Tutup"
        onConfirm={() => onOpenChange(false)}
      />
    </>
  );
}
