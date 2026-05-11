"use client"
/**
 * AppProvider.tsx  (Firebase edition)
 * ------------------------------------
 * Replaces the in-memory useState implementation with:
 *   - Firebase Auth for login / logout
 *   - Firestore onSnapshot listeners for all collections (real-time)
 *   - Firestore writes for all mutations
 *
 * Fixes:
 *   - Forces ID token refresh before starting listeners to avoid the
 *     permission-denied race condition on first login.
 *   - Adds error handlers to all snapshot listeners (silences the
 *     expected permission-denied flash; logs real errors only).
 *   - handleRoles / handleShifts always calls setState even when seeding.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import {
  type User, type RawMaterial, type WorkOrder, type MonthlySchedule,
  type PTC, type DailyProductionEntry, type ProcessRecord,
  type DowntimeEvent, type QIInspection, type FQIInspection,
  type ShiftConfig, type RoleConfig,
  UserRole, DEFAULT_SHIFT_CONFIGS, DEFAULT_ROLE_CONFIGS,
} from "@/lib/store"
import { onAuthStateChange, signIn, signOut, fetchUserProfile, auth } from "@/lib/auth"
import * as fs from "@/lib/firestoreService"
import { getIdToken } from "firebase/auth"

// ─── Context type ─────────────────────────────────────────────────────────────

interface AppContextType {
  currentUser: User | null
  loading: boolean
  clientId: string | null

  login:  (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>

  // ── Users ──────────────────────────────────────────────────────────────────
  users:       User[]
  addUser:     (data: { name: string; email: string; password: string; role: UserRole; plant?: string; department?: string }) => Promise<{ success: boolean; error?: string }>
  updateUser:  (id: string, d: Partial<User>) => Promise<void>
  deleteUser:  (id: string) => Promise<void>

  // ── Materials ──────────────────────────────────────────────────────────────
  materials:       RawMaterial[]
  addMaterial:     (m: Omit<RawMaterial, "id">)          => Promise<void>
  updateMaterial:  (id: string, d: Partial<RawMaterial>) => Promise<void>
  deductMaterial:  (materialId: string, requiredKg: number) => Promise<boolean>
  consumeMaterial: (materialId: string, consumedKg: number) => Promise<void>

  // ── Schedules ──────────────────────────────────────────────────────────────
  schedules:     MonthlySchedule[]
  addSchedule:   (s: Omit<MonthlySchedule, "id" | "createdAt">)  => Promise<void>
  updateSchedule:(id: string, d: Partial<MonthlySchedule>)        => Promise<void>
  deleteSchedule:(id: string)                                      => Promise<void>

  // ── PTCs ───────────────────────────────────────────────────────────────────
  ptcs:    PTC[]
  addPTC:  (p: Omit<PTC, "id" | "createdAt">) => Promise<void>
  deletePTC:(id: string)                       => Promise<void>

  // ── Work Orders ────────────────────────────────────────────────────────────
  workOrders:     WorkOrder[]
  addWorkOrder:   (wo: Omit<WorkOrder, "id" | "createdAt">)  => Promise<void>
  updateWorkOrder:(id: string, d: Partial<WorkOrder>)         => Promise<void>
  deleteWorkOrder:(id: string)                                 => Promise<void>

  // ── Daily Entries ──────────────────────────────────────────────────────────
  dailyEntries:     DailyProductionEntry[]
  addDailyEntry:    (e: Omit<DailyProductionEntry, "id" | "createdAt">) => Promise<void>
  updateDailyEntry: (id: string, d: Partial<DailyProductionEntry>)      => Promise<void>
  deleteDailyEntry: (id: string)                                          => Promise<void>

  // ── Process Records ────────────────────────────────────────────────────────
  processRecords:     ProcessRecord[]
  addProcessRecord:   (r: Omit<ProcessRecord, "id" | "createdAt">)  => Promise<void>
  updateProcessRecord:(id: string, d: Partial<ProcessRecord>)        => Promise<void>

  // ── Downtime Events ────────────────────────────────────────────────────────
  downtimeEvents:  DowntimeEvent[]
  addDowntimeEvent:(e: Omit<DowntimeEvent, "id" | "createdAt">) => Promise<void>

  // ── QI / FQI ───────────────────────────────────────────────────────────────
  qiInspections:  QIInspection[]
  addQIInspection:(i: Omit<QIInspection, "id" | "createdAt">) => Promise<void>

  fqiInspections:  FQIInspection[]
  addFQIInspection:(i: Omit<FQIInspection, "id" | "createdAt">) => Promise<void>

  // ── Config: Roles ──────────────────────────────────────────────────────────
  roles:          RoleConfig[]
  addRole:        (data: Omit<RoleConfig, "id">) => Promise<void>
  updateRole:     (id: string, data: Partial<RoleConfig>) => Promise<void>
  deleteRole:     (id: string) => Promise<void>

  // ── Config: Shifts ─────────────────────────────────────────────────────────
  shifts:       ShiftConfig[]
  addShift:     (shift: ShiftConfig) => Promise<void>
  deleteShift:  (id: string) => Promise<void>
  updateShift:  (id: string, data: Partial<ShiftConfig>) => Promise<void>
  reorderShift: (orderedIds: string[]) => Promise<void>
  confirmShifts: () => Promise<void>

  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
}

const AppContext = createContext<AppContextType | null>(null)

export const useApp = () => {
  const c = useContext(AppContext)
  if (!c) throw new Error("useApp must be inside AppProvider")
  return c
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {

  const [currentUser,      setCurrentUser]      = useState<User | null>(null)
  const [clientId,         setClientId]         = useState<string | null>(null)
  const [loading,          setLoading]          = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Collection state
  const [users,           setUsers]           = useState<User[]>([])
  const [materials,       setMaterials]       = useState<RawMaterial[]>([])
  const [schedules,       setSchedules]       = useState<MonthlySchedule[]>([])
  const [ptcs,            setPtcs]            = useState<PTC[]>([])
  const [workOrders,      setWorkOrders]      = useState<WorkOrder[]>([])
  const [dailyEntries,    setDailyEntries]    = useState<DailyProductionEntry[]>([])
  const [processRecords,  setProcessRecords]  = useState<ProcessRecord[]>([])
  const [downtimeEvents,  setDowntimeEvents]  = useState<DowntimeEvent[]>([])
  const [qiInspections,   setQIInspections]   = useState<QIInspection[]>([])
  const [fqiInspections,  setFQIInspections]  = useState<FQIInspection[]>([])
  // Config collections
  const [roles,           setRoles]           = useState<RoleConfig[]>([])
  const [shifts,          setShifts]          = useState<ShiftConfig[]>([])

  const unsubsRef = useRef<Array<() => void>>([])

  const clearListeners = () => {
    unsubsRef.current.forEach(u => u())
    unsubsRef.current = []
  }

  // ─── Auth state listener ────────────────────────────────────────────────────

  useEffect(() => {
    const unsubAuth = onAuthStateChange(async (firebaseUser) => {
      clearListeners()

      if (!firebaseUser) {
        setCurrentUser(null)
        setClientId(null)
        setLoading(false)
        return
      }

      try {
        let profile = null

        try {
          profile = await fetchUserProfile(firebaseUser)
        } catch (err: any) {
          if (err?.code === "permission-denied") {
            await new Promise(r => setTimeout(r, 300))
            profile = await fetchUserProfile(firebaseUser)
          } else {
            throw err
          }
        }

        if (!profile) {
          await signOut()
          setCurrentUser(null)
          setClientId(null)
          setLoading(false)
          return
        }

        setCurrentUser(profile)

        const cid =
            profile.role === UserRole.SYSTEM_ADMIN
                ? null
                : (profile as User & { clientId?: string }).clientId ?? null

        setClientId(cid)

        if (cid) {
          // Force-refresh the ID token so Firestore rules see request.auth
          // immediately. Without this, the first snapshot fires before the
          // token propagates, causing a permission-denied flash.
          await firebaseUser.getIdToken(true)

          // Small buffer to let the refreshed token reach Firestore's auth layer.
          await new Promise(r => setTimeout(r, 400))

          // Seed roles/shifts if empty (new client), always update state.
          const handleRoles = (loadedRoles: RoleConfig[]) => {
            if (loadedRoles.length === 0) {
              fs.seedDefaultRoles(cid, DEFAULT_ROLE_CONFIGS).catch(console.error)
              setRoles(DEFAULT_ROLE_CONFIGS)
            } else {
              setRoles(loadedRoles)
            }
          }

          const handleShifts = (loadedShifts: ShiftConfig[]) => {
            if (loadedShifts.length === 0) {
              fs.seedDefaultShifts(cid, DEFAULT_SHIFT_CONFIGS).catch(console.error)
              setShifts(DEFAULT_SHIFT_CONFIGS)
            } else {
              setShifts(loadedShifts)
            }
          }

          // Silent handler for the rare permission-denied that still slips through.
          // Real errors (network, etc.) are still logged.
          const onSnapError = (err: Error) => {
            const code = (err as any)?.code ?? ""
            if (!code.includes("permission-denied")) {
              console.error("Snapshot listener error:", err)
            }
          }

          unsubsRef.current = [
            fs.subscribeUsers(cid, setUsers, onSnapError),
            fs.subscribeMaterials(cid, setMaterials, onSnapError),
            fs.subscribeSchedules(cid, setSchedules, onSnapError),
            fs.subscribePTCs(cid, setPtcs, onSnapError),
            fs.subscribeWorkOrders(cid, setWorkOrders, onSnapError),
            fs.subscribeDailyEntries(cid, setDailyEntries, onSnapError),
            fs.subscribeProcessRecords(cid, setProcessRecords, onSnapError),
            fs.subscribeDowntimeEvents(cid, setDowntimeEvents, onSnapError),
            fs.subscribeQIInspections(cid, setQIInspections, onSnapError),
            fs.subscribeFQIInspections(cid, setFQIInspections, onSnapError),
            fs.subscribeRoles(cid, handleRoles, onSnapError),
            fs.subscribeShifts(cid, handleShifts, onSnapError),
          ]
        }
      } catch (err) {
        console.error("Error loading user profile:", err)
      } finally {
        setLoading(false)
      }
    })

    return () => {
      unsubAuth()
      clearListeners()
    }
  }, [])

  // ─── Auth actions ────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    return signIn(email, password)
  }, [])

  const logout = useCallback(async () => {
    clearListeners()
    await signOut()
    setCurrentUser(null)
    setClientId(null)
  }, [])

  // ─── Mutation helpers ────────────────────────────────────────────────────────

  const cid = () => {
    if (!clientId) throw new Error("No client context — system admin cannot write client data directly.")
    return clientId
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  const addUser = useCallback(async (data: {
    name: string
    email: string
    password: string
    role: UserRole
    plant?: string
    department?: string
  }): Promise<{ success: boolean; error?: string }> => {
    const firebaseUser = auth.currentUser
    if (!firebaseUser) return { success: false, error: "Not authenticated." }

    try {
      const token = await getIdToken(firebaseUser)
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          displayName: data.name,
          clientId: cid(),
          role: data.role,
          name: data.name,
          plant: data.plant ?? "",
          department: data.department ?? "",
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        return { success: false, error: json.error ?? "Failed to create user." }
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? "Failed to create user." }
    }
  }, [clientId])

  const updateUser = useCallback(async (id: string, data: Partial<User>) => {
    await fs.updateUserProfile(cid(), id, data)
  }, [clientId])

  const deleteUser = useCallback(async (id: string) => {
    const firebaseUser = auth.currentUser
    await fs.deleteUserProfile(cid(), id)
    if (firebaseUser) {
      try {
        const token = await getIdToken(firebaseUser)
        await fetch("/api/users", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ uid: id }),
        })
      } catch (err) {
        console.warn("deleteUser: Auth account deletion failed (profile already removed):", err)
      }
    }
  }, [clientId])

  // ── Materials ──────────────────────────────────────────────────────────────
  const addMaterial = useCallback(async (data: Omit<RawMaterial, "id">) => {
    await fs.addMaterial(cid(), data)
  }, [clientId])

  const updateMaterial = useCallback(async (id: string, data: Partial<RawMaterial>) => {
    await fs.updateMaterial(cid(), id, data)
  }, [clientId])

  const deductMaterial = useCallback(async (materialId: string, requiredKg: number): Promise<boolean> => {
    return fs.deductMaterial(cid(), materialId, requiredKg)
  }, [clientId])

  const consumeMaterial = useCallback(async (materialId: string, consumedKg: number) => {
    await fs.consumeMaterial(cid(), materialId, consumedKg)
  }, [clientId])

  // ── Schedules ──────────────────────────────────────────────────────────────
  const addSchedule = useCallback(async (data: Omit<MonthlySchedule, "id" | "createdAt">) => {
    await fs.addSchedule(cid(), data)
  }, [clientId])

  const updateSchedule = useCallback(async (id: string, data: Partial<MonthlySchedule>) => {
    await fs.updateSchedule(cid(), id, data)
  }, [clientId])

  const deleteSchedule = useCallback(async (id: string) => {
    await fs.deleteSchedule(cid(), id)
  }, [clientId])

  // ── PTCs ───────────────────────────────────────────────────────────────────
  const addPTC = useCallback(async (data: Omit<PTC, "id" | "createdAt">) => {
    await fs.addPTC(cid(), data)
  }, [clientId])

  const deletePTC = useCallback(async (id: string) => {
    await fs.deletePTC(cid(), id)
  }, [clientId])

  // ── Work Orders ────────────────────────────────────────────────────────────
  const addWorkOrder = useCallback(async (data: Omit<WorkOrder, "id" | "createdAt">) => {
    await fs.addWorkOrder(cid(), data)
  }, [clientId])

  const updateWorkOrder = useCallback(async (id: string, data: Partial<WorkOrder>) => {
    await fs.updateWorkOrder(cid(), id, data)
  }, [clientId])

  const deleteWorkOrder = useCallback(async (id: string) => {
    await fs.deleteWorkOrder(cid(), id)
  }, [clientId])

  // ── Daily Entries ──────────────────────────────────────────────────────────
  const addDailyEntry = useCallback(async (data: Omit<DailyProductionEntry, "id" | "createdAt">) => {
    await fs.addDailyEntry(cid(), data)
  }, [clientId])

  const updateDailyEntry = useCallback(async (id: string, data: Partial<DailyProductionEntry>) => {
    await fs.updateDailyEntry(cid(), id, data)
  }, [clientId])

  const deleteDailyEntry = useCallback(async (id: string) => {
    await fs.deleteDailyEntry(cid(), id)
  }, [clientId])

  // ── Process Records ────────────────────────────────────────────────────────
  const addProcessRecord = useCallback(async (data: Omit<ProcessRecord, "id" | "createdAt">) => {
    await fs.addProcessRecord(cid(), data)
  }, [clientId])

  const updateProcessRecord = useCallback(async (id: string, data: Partial<ProcessRecord>) => {
    await fs.updateProcessRecord(cid(), id, data)
  }, [clientId])

  // ── Downtime Events ────────────────────────────────────────────────────────
  const addDowntimeEvent = useCallback(async (data: Omit<DowntimeEvent, "id" | "createdAt">) => {
    await fs.addDowntimeEvent(cid(), data)
  }, [clientId])

  // ── QI / FQI ───────────────────────────────────────────────────────────────
  const addQIInspection = useCallback(async (data: Omit<QIInspection, "id" | "createdAt">) => {
    await fs.addQIInspection(cid(), data)
  }, [clientId])

  const addFQIInspection = useCallback(async (data: Omit<FQIInspection, "id" | "createdAt">) => {
    await fs.addFQIInspection(cid(), data)
  }, [clientId])

  // ── Config: Roles ──────────────────────────────────────────────────────────
  const addRole = useCallback(async (data: Omit<RoleConfig, "id">) => {
    await fs.addRoleConfig(cid(), data)
  }, [clientId])

  const updateRole = useCallback(async (id: string, data: Partial<RoleConfig>) => {
    await fs.updateRoleConfig(cid(), id, data)
  }, [clientId])

  const deleteRole = useCallback(async (id: string) => {
    await fs.deleteRoleConfig(cid(), id)
  }, [clientId])

  // ── Config: Shifts ─────────────────────────────────────────────────────────
  const addShift = useCallback(async (shift: ShiftConfig) => {
    await fs.createShiftConfig(cid(), shift)
  }, [clientId])

  const deleteShift = useCallback(async (id: string) => {
    await fs.deleteShiftConfig(cid(), id)
  }, [clientId])

  const updateShift = useCallback(async (id: string, data: Partial<ShiftConfig>) => {
    await fs.updateShiftConfig(cid(), id, data)
  }, [clientId])

  const reorderShift = useCallback(async (orderedIds: string[]) => {
    await fs.reorderShiftConfigs(cid(), orderedIds)
  }, [clientId])

  const confirmShifts = useCallback(async () => {
    await fs.confirmShiftConfigs(cid())
  }, [clientId])

  // ─── Context value ───────────────────────────────────────────────────────────

  return (
      <AppContext.Provider value={{
        currentUser, loading, clientId,
        login, logout,

        users,        addUser,       updateUser,    deleteUser,
        materials,    addMaterial,   updateMaterial, deductMaterial, consumeMaterial,
        schedules,    addSchedule,   updateSchedule, deleteSchedule,
        ptcs,         addPTC,        deletePTC,
        workOrders,   addWorkOrder,  updateWorkOrder, deleteWorkOrder,
        dailyEntries, addDailyEntry, updateDailyEntry, deleteDailyEntry,
        processRecords, addProcessRecord, updateProcessRecord,
        downtimeEvents, addDowntimeEvent,
        qiInspections,  addQIInspection,
        fqiInspections, addFQIInspection,

        roles,  addRole,  updateRole,  deleteRole,
        shifts, addShift, deleteShift, updateShift, reorderShift, confirmShifts,

        sidebarCollapsed, setSidebarCollapsed,
      }}>
        {children}
      </AppContext.Provider>
  )
}