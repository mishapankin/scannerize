"use client"

import { useState } from "react"
import { HexColorPicker } from "react-colorful"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

type ColorPickerProps = {
  id?: string
  value: string
  label: string
  onValueChange: (value: string) => void
  onValueChangeEnd: () => void
}

export function ColorPicker({
  id,
  value,
  label,
  onValueChange,
  onValueChangeEnd,
}: ColorPickerProps) {
  const [draft, setDraft] = useState(value.toUpperCase())

  const updateColor = (color: string) => {
    const normalized = color.toUpperCase()
    setDraft(normalized)
    onValueChange(normalized)
  }

  const finishTextEdit = () => {
    if (!HEX_COLOR_PATTERN.test(draft)) {
      setDraft(value.toUpperCase())
    }
    onValueChangeEnd()
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setDraft(value.toUpperCase())
        else onValueChangeEnd()
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="ghost"
            className="w-12 border border-input p-0"
            style={{ backgroundColor: value }}
            aria-label={label}
          />
        }
      />
      <PopoverContent
        side="left"
        align="start"
        sideOffset={8}
        className="w-56 gap-2 p-2"
        aria-label={label}
      >
        <HexColorPicker
          color={value}
          onChange={updateColor}
          onChangeEnd={onValueChangeEnd}
          className="scannerize-color-picker"
          aria-label={label}
        />
        <Input
          value={draft}
          onChange={(event) => {
            const nextValue = event.target.value.toUpperCase()
            setDraft(nextValue)
            if (HEX_COLOR_PATTERN.test(nextValue)) onValueChange(nextValue)
          }}
          onBlur={finishTextEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
          aria-label="Hex color"
          maxLength={7}
          spellCheck={false}
        />
      </PopoverContent>
    </Popover>
  )
}
