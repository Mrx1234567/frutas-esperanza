'use client'

import { useEffect, useState } from "react";
import { createBrowserClient } from '@supabase/ssr';
import Link from "next/link";
import BotonSalir from "./BotonSalir";

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  const [haySesion, setHaySesion] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHaySesion(!!session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setHaySesion(!!session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      {/* Barra de Navegación: SOLO si hay sesión activa */}
      {haySesion && (
        <nav className="bg-green-700 text-white shadow-md">
          <div className="max-w-6xl mx-auto px-4">
            {/* Usamos flex-col en celular y flex-row en computadora */}
            <div className="flex flex-col sm:flex-row items-center justify-between py-3 sm:h-16 gap-3 sm:gap-0">
              
              {/* Logo - Siempre visible */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start">
                <span className="text-2xl">🍎</span>
                <Link href="/" className="font-bold text-xl tracking-tight">
                  Frutas Esperanza
                </Link>
              </div>
              
              {/* Enlaces - Ahora son visibles en todos los dispositivos */}
              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-4 w-full sm:w-auto">
                <Link href="/" className="hover:bg-green-600 px-2 py-1 sm:px-3 sm:py-2 rounded-md font-medium text-sm sm:text-base transition">
                  Pedidos
                </Link>
                <Link href="/inventario" className="hover:bg-green-600 px-2 py-1 sm:px-3 sm:py-2 rounded-md font-medium text-sm sm:text-base transition">
                  Inventario
                </Link>
                <Link href="/clientes" className="hover:bg-green-600 px-2 py-1 sm:px-3 sm:py-2 rounded-md font-medium text-sm sm:text-base transition">
                  Clientes
                </Link>
                <Link href="/nuevo-pedido" className="bg-white text-green-700 hover:bg-gray-100 px-3 py-1 sm:px-4 sm:py-2 rounded-md font-bold text-sm sm:text-base transition">
                  + Pedido
                </Link>
                <BotonSalir />
              </div>
            </div>
          </div>
        </nav>
      )}      

      {/* El contenido SIEMPRE se renderiza */}
      <main className={haySesion ? "max-w-6xl mx-auto p-4 md:p-6 pb-20" : ""}>
        {children}
      </main>
    </>
  );
}