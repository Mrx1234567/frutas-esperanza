'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export default function BotonSalir() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button 
      onClick={cerrarSesion} 
      className="text-red-200 hover:text-white hover:bg-red-600 px-3 py-2 rounded-md transition text-sm font-medium ml-4 border border-red-300"
    >
      Salir
    </button>
  )
}