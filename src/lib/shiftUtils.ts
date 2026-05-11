import type { Shift, ShiftConfig } from "./store"

export type ShiftOption = {
  id: Shift
  label: string
  isActive: boolean
}

export function orderedShiftConfigs(shifts: ShiftConfig[]): ShiftConfig[] {
  return [...shifts].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export function getShiftLabel(shifts: ShiftConfig[], shiftId: Shift | "" | undefined): string {
  if (!shiftId) return "Unassigned"
  const match = shifts.find(shift => shift.id === shiftId)
  if (match) return match.name

  const legacyMatch = /^shift_(\d+)$/i.exec(shiftId)
  if (legacyMatch) return `Shift ${legacyMatch[1]}`

  return shiftId
}

export function getActiveShiftOptions(shifts: ShiftConfig[]): ShiftOption[] {
  return orderedShiftConfigs(shifts)
    .filter(shift => shift.isActive)
    .map(shift => ({ id: shift.id, label: shift.name, isActive: shift.isActive }))
}

export function getSelectableShiftOptions(shifts: ShiftConfig[], currentShift?: Shift | ""): ShiftOption[] {
  const activeOptions = getActiveShiftOptions(shifts)
  if (!currentShift || activeOptions.some(option => option.id === currentShift)) return activeOptions

  return [
    ...activeOptions,
    { id: currentShift, label: `${getShiftLabel(shifts, currentShift)} (inactive/legacy)`, isActive: false },
  ]
}

export function firstShiftId(shifts: ShiftConfig[]): Shift | "" {
  return getActiveShiftOptions(shifts)[0]?.id ?? ""
}