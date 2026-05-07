import { redirect } from "next/navigation"

export default function ConfigShiftsRedirectPage() {
  redirect("/dashboard/config?tab=shifts")
}
