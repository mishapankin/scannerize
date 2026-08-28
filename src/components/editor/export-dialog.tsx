"use client"

import { useMemo, useState } from "react"
import { CircleHelpIcon, DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  buildExportPlan,
  type ExportDpi,
  type ExportSettings,
  type PageSizeMode,
  type PageSizeTarget,
} from "@/lib/export-plan"
import type { EditorDocument } from "@/types/editor"

type ExportDialogProps = {
  document: EditorDocument | null
  selectedPageId: string | null
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onExport: (settings: ExportSettings) => void
}

const PAGE_SIZE_MODES = [
  { label: "Original sizes", value: "original" },
  { label: "Limit oversized pages", value: "limit-oversized" },
  { label: "Uniform page size", value: "uniform" },
]

const PAGE_SIZE_TARGETS = [
  { label: "Auto", value: "auto" },
  { label: "A4", value: "a4" },
  { label: "Letter", value: "letter" },
  { label: "Current page", value: "current" },
  { label: "Custom", value: "custom" },
]

const QUALITY_OPTIONS = [
  { label: "Screen · 96 DPI", value: "96" },
  { label: "Standard · 150 DPI", value: "150" },
  { label: "Print · 300 DPI", value: "300" },
]

const PAGE_SIZE_HELP: Record<PageSizeMode, string> = {
  original: "Keep each page's dimensions.",
  "limit-oversized": "Shrink pages more than 10% larger than the target.",
  uniform: "Fit every page to the target without cropping.",
}

function HelpTooltip({ label, children }: { label: string; children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="cursor-default"
            aria-label={label}
          />
        }
      >
        <CircleHelpIcon />
      </TooltipTrigger>
      <TooltipContent side="right">{children}</TooltipContent>
    </Tooltip>
  )
}

export function ExportDialog({
  document,
  selectedPageId,
  disabled,
  open: controlledOpen,
  onOpenChange,
  onExport,
}: ExportDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }
  const [dpi, setDpi] = useState<ExportDpi>(300)
  const [preserveUntouched, setPreserveUntouched] = useState(true)
  const [pageSizeMode, setPageSizeMode] =
    useState<PageSizeMode>("limit-oversized")
  const [pageSizeTarget, setPageSizeTarget] =
    useState<PageSizeTarget>("auto")
  const [customWidthMm, setCustomWidthMm] = useState(210)
  const [customHeightMm, setCustomHeightMm] = useState(297)
  const customSizeValid =
    customWidthMm >= 10 &&
    customWidthMm <= 2000 &&
    customHeightMm >= 10 &&
    customHeightMm <= 2000

  const settings = useMemo<ExportSettings>(
    () => ({
      dpi,
      preserveUntouched,
      pageSizeMode,
      pageSizeTarget,
      currentPageId: selectedPageId,
      customWidthMm,
      customHeightMm,
    }),
    [
      customHeightMm,
      customWidthMm,
      dpi,
      pageSizeMode,
      pageSizeTarget,
      preserveUntouched,
      selectedPageId,
    ]
  )
  const pages = document?.pages
  const plan = useMemo(
    () => buildExportPlan(pages ?? [], settings),
    [pages, settings]
  )

  function submitExport() {
    setOpen(false)
    onExport(settings)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen} modal>
      <DialogTrigger
        render={<Button size="sm" disabled={disabled} />}
      >
        <DownloadIcon data-icon="inline-start" />
        Export
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        initialFocus={() => globalThis.document.getElementById("export-quality")}
      >
        <DialogHeader>
          <DialogTitle>Export PDF</DialogTitle>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <FieldSet className="gap-2">
            <FieldLegend variant="label">Quality</FieldLegend>
            <Select
              items={QUALITY_OPTIONS}
              value={String(dpi)}
              onValueChange={(value) => {
                const nextDpi = Number(value) as ExportDpi
                if (nextDpi === 96 || nextDpi === 150 || nextDpi === 300) {
                  setDpi(nextDpi)
                }
              }}
            >
              <SelectTrigger
                id="export-quality"
                className="w-full"
                aria-label="Export quality"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {QUALITY_OPTIONS.map((quality) => (
                    <SelectItem key={quality.value} value={quality.value}>
                      {quality.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FieldSet>

          <Separator />

          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>
                <FieldLabel htmlFor="preserve-untouched">
                  Preserve untouched pages
                </FieldLabel>
                <HelpTooltip label="About preserving untouched pages">
                Copy unchanged PDF pages without rasterizing.
                </HelpTooltip>
              </FieldTitle>
            </FieldContent>
            <Switch
              id="preserve-untouched"
              aria-label="Preserve untouched pages"
              checked={preserveUntouched}
              onCheckedChange={setPreserveUntouched}
            />
          </Field>

          <Separator />

          <Field>
            <FieldTitle>
              <FieldLabel htmlFor="export-page-size">Page size</FieldLabel>
              <HelpTooltip label="About page sizing">
                {PAGE_SIZE_HELP[pageSizeMode]}
              </HelpTooltip>
            </FieldTitle>
            <Select
              items={PAGE_SIZE_MODES}
              value={pageSizeMode}
              onValueChange={(value) =>
                value && setPageSizeMode(value as PageSizeMode)
              }
            >
              <SelectTrigger
                id="export-page-size"
                className="w-full"
                aria-label="Page size"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {PAGE_SIZE_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          {pageSizeMode !== "original" && (
            <Field>
              <FieldLabel>Target</FieldLabel>
              <Select
                items={PAGE_SIZE_TARGETS}
                value={pageSizeTarget}
                onValueChange={(value) =>
                  value && setPageSizeTarget(value as PageSizeTarget)
                }
              >
                <SelectTrigger className="w-full" aria-label="Target page size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {PAGE_SIZE_TARGETS.map((target) => (
                      <SelectItem key={target.value} value={target.value}>
                        {target.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}

          {pageSizeMode !== "original" && pageSizeTarget === "custom" && (
            <FieldSet data-invalid={!customSizeValid}>
              <FieldLegend variant="label">Custom size · mm</FieldLegend>
              <FieldGroup className="grid grid-cols-2 gap-2">
                <Field data-invalid={!customSizeValid}>
                  <FieldLabel htmlFor="export-width">Width</FieldLabel>
                  <Input
                    id="export-width"
                    type="number"
                    min={10}
                    max={2000}
                    step={1}
                    value={customWidthMm}
                    aria-invalid={!customSizeValid}
                    onChange={(event) =>
                      setCustomWidthMm(Number(event.target.value))
                    }
                  />
                </Field>
                <Field data-invalid={!customSizeValid}>
                  <FieldLabel htmlFor="export-height">Height</FieldLabel>
                  <Input
                    id="export-height"
                    type="number"
                    min={10}
                    max={2000}
                    step={1}
                    value={customHeightMm}
                    aria-invalid={!customSizeValid}
                    onChange={(event) =>
                      setCustomHeightMm(Number(event.target.value))
                    }
                  />
                </Field>
              </FieldGroup>
              {!customSizeValid && <FieldError>Use 10–2000 mm.</FieldError>}
            </FieldSet>
          )}
        </FieldGroup>

        <Separator />

        <Field orientation="horizontal">
          <FieldTitle>
            {document?.pages.length ?? 0}{" "}
            {document?.pages.length === 1 ? "page" : "pages"}
          </FieldTitle>
          <span className="ml-auto text-xs text-muted-foreground">
            {plan.resizedCount} resized · {plan.preservedCount} preserved
          </span>
        </Field>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={
              pageSizeMode !== "original" &&
              pageSizeTarget === "custom" &&
              !customSizeValid
            }
            onClick={submitExport}
          >
            <DownloadIcon data-icon="inline-start" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
