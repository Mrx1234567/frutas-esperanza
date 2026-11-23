'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase/client'
import ClientWrapper from './ClientWrapper'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  const [pedidos, setPedidos] = useState<any[]>([])
  const [loteActivo, setLoteActivo] = useState<any>(null)
  const [resumenEmbolsar, setResumenEmbolsar] = useState<any[]>([])
  const [inventarioDisponible, setInventarioDisponible] = useState<any[]>([])
  const [totales, setTotales] = useState({ 
    clientes: 0, 
    recaudar: 0, 
    costoInvertido: 0, 
    gananciaNeta: 0 
  })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    verificarSesionYCargar()
  }, [])

  async function verificarSesionYCargar() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }
    await cargarDatos()
  }

  async function cargarDatos() {
    setCargando(true)
    
    // 1. Obtener el lote activo
    const { data: lotes } = await supabase
      .from('lotes')
      .select('*')
      .eq('estado', 'abierto')
      .order('creado_en', { ascending: false })
      .limit(1)

    if (!lotes || lotes.length === 0) {
      setLoteActivo(null)
      setCargando(false)
      return
    }

    const lote = lotes[0]
    setLoteActivo(lote)

    // 2. Obtener datos de la base para calcular
    const { data: prods } = await supabase.from('productos').select('*')
    const { data: invData } = await supabase.from('lote_items').select('*').eq('lote_id', lote.id)
    const { data: pedidosData } = await supabase
      .from('pedidos')
      .select(`
        id, estado, total, franja_entrega, notas,
        clientes ( nombre, telefono, zonas_entrega(nombre, color) ),
        pedido_items ( cantidad_promos, producto_id, subtotal )
      `)
      .eq('lote_id', lote.id)
      .neq('estado', 'cancelado')
      .order('id', { ascending: true })

    if (pedidosData && prods) {
      setPedidos(pedidosData)

      let recaudar = 0
      let costoInvertido = 0
      const clientesUnicos = new Set()
      const ventasPorProducto: { [key: number]: number } = {}
      
      // A. Calcular ventas y totales de pedidos
      pedidosData.forEach(p => {
        recaudar += Number(p.total)
        const clienteObj = p.clientes as any
        if (clienteObj?.nombre) clientesUnicos.add(clienteObj.nombre)

        p.pedido_items.forEach((item: any) => {
          ventasPorProducto[item.producto_id] = (ventasPorProducto[item.producto_id] || 0) + item.cantidad_promos
        })
      })

      // B. Calcular Costo Invertido (lo que pagaste al proveedor)
      // C. Calcular Inventario Disponible
      const resumenInv: any[] = []
      prods.forEach(prod => {
        const invItem = invData?.find(i => i.producto_id === prod.id)
        
        let unidadesCompradas = 0
        if (invItem) {
          // Si es caja fija (Uvas/Arándanos), calculamos por cajas * 18
          const esCajaFija = prod.nombre.includes('Uva') || prod.nombre.includes('Arándano')
          if (esCajaFija) {
            unidadesCompradas = (invItem.cajas || 0) * 18
          } else {
            unidadesCompradas = invItem.unidades_reales || 0
          }
          
          const mermas = invItem.mermas || 0
          costoInvertido += (invItem.cajas || 0) * (prod.precio_costo_caja || 0)
          
          const totalDisponible = unidadesCompradas - mermas
          const promosDisponibles = totalDisponible / prod.unidades_por_promo
          const vendido = ventasPorProducto[prod.id] || 0
          const sobrante = promosDisponibles - vendido

          if (unidadesCompradas > 0) {
            resumenInv.push({
              nombre: prod.nombre,
              unidadesCompradas,
              mermas,
              vendido,
              sobrante
            })
          }
        }
      })
      setInventarioDisponible(resumenInv)

      // D. Calcular Resumen para Embolsar
      const agrupado: { [key: number]: number } = {}
      pedidosData.forEach(pedido => {
        pedido.pedido_items.forEach((item: any) => {
          agrupado[item.producto_id] = (agrupado[item.producto_id] || 0) + item.cantidad_promos
        })
      })

      const resumenArray = Object.entries(agrupado).map(([prodId, cantidad]) => {
        const prod = prods.find(p => p.id === Number(prodId))
        return { nombre: prod?.nombre || 'Desconocido', cantidad }
      }).filter(item => item.cantidad > 0)

      setResumenEmbolsar(resumenArray)
      
      setTotales({
        clientes: clientesUnicos.size,
        recaudar: recaudar,
        costoInvertido: costoInvertido,
        gananciaNeta: recaudar - costoInvertido // Ganancia provisional
      })
    }
    setCargando(false)
  }

  const generarPDF = () => {
    const doc = new jsPDF()
    
    // Título y datos del lote
    doc.setFontSize(18)
    doc.text('Frutas Esperanza - Reporte de Pedidos', 14, 20)
    
    doc.setFontSize(10)
    doc.setTextColor(100)
    if (loteActivo) {
      doc.text(`Lote: ${new Date(loteActivo.creado_en).toLocaleDateString()}`, 14, 28)
    }
    doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 33)
    
    // Tabla de Pedidos
    const tableData = pedidos.map(p => [
      p.clientes?.nombre || 'Sin nombre',
      p.clientes?.telefono || 'Sin tel.',
      p.franja_entrega || '-',
      p.estado.toUpperCase(),
      `$${Number(p.total).toFixed(2)}`
    ])

    autoTable(doc, {
      startY: 40,
      head: [['Cliente', 'Teléfono', 'Entrega', 'Estado', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] }, // Verde
      styles: { fontSize: 9 },
    })

    // Resumen de Recaudación
    const finalY = (doc as any).lastAutoTable.finalY || 100
    doc.setFontSize(12)
    doc.setTextColor(0)
    doc.text(`Total a Recaudar: $${totales.recaudar.toFixed(2)}`, 14, finalY + 10)
    doc.text(`Ganancia Proyectada: $${totales.gananciaNeta.toFixed(2)}`, 14, finalY + 17)

    // Resumen para Embolsar
    if (resumenEmbolsar.length > 0) {
      doc.text('Resumen para Embolsar:', 14, finalY + 30)
      
      const embolsarData = resumenEmbolsar.map(item => [
        item.nombre,
        `${item.cantidad} promos`
      ])

      autoTable(doc, {
        startY: finalY + 35,
        head: [['Producto', 'Cantidad a Preparar']],
        body: embolsarData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] }, // Azul
        styles: { fontSize: 9 },
      })
    }

    // Guardar el PDF
    doc.save(`Reporte_Frutas_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  if (cargando) return (
    <ClientWrapper>
      <div className="p-10 text-center text-gray-500">Cargando panel...</div>
    </ClientWrapper>
  )

  return (
    <ClientWrapper>
      <div className="space-y-6 max-w-6xl mx-auto p-4">
        
        {/* Encabezado */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Panel de Pedidos 📦</h1>
            {loteActivo && (
              <p className="text-sm text-green-600 font-medium">
                Lote activo iniciado el {new Date(loteActivo.creado_en).toLocaleDateString()}
              </p>
            )}
          </div>
          <button 
            onClick={generarPDF}
            className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 transition flex items-center gap-2 shadow-sm w-full sm:w-auto justify-center"
          >
            📄 Descargar Reporte PDF
          </button>
        </div>

        {!loteActivo ? (
          <div className="bg-yellow-50 border border-yellow-200 p-8 rounded-xl text-center shadow-sm">
            <h2 className="text-xl font-bold text-yellow-800 mb-2">No hay ningún lote activo</h2>
            <p className="text-yellow-700 mb-4">Ve a la sección de Inventario para iniciar un nuevo ciclo de ventas.</p>
            <Link href="/inventario" className="bg-yellow-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-yellow-700 inline-block">
              Ir a Inventario
            </Link>
          </div>
        ) : (
          <>
            {/* Tarjetas de Resumen Financiero */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500 font-medium">Clientes (Pedidos)</p>
                <p className="text-3xl font-bold text-gray-800">{pedidos.length}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500 font-medium">Total a Recaudar</p>
                <p className="text-3xl font-bold text-green-600">${totales.recaudar.toFixed(2)}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500 font-medium">Invertido Proveedor</p>
                <p className="text-3xl font-bold text-red-600">${totales.costoInvertido.toFixed(2)}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500 font-medium">Ganancia Proyectada</p>
                <p className="text-3xl font-bold text-blue-600">${totales.gananciaNeta.toFixed(2)}</p>
              </div>
            </div>

            {/* Inventario Disponible (NUEVA SECCIÓN) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-blue-50">
                <h2 className="font-bold text-blue-800">📦 Disponibles para Vender (Sobrantes)</h2>
                <p className="text-sm text-blue-600">Lo que trajo el proveedor menos las mermas y lo ya vendido</p>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {inventarioDisponible.map((item, idx) => {
                  const nombreCorto = item.nombre.split(' ')[0] // Uva, Mandarina, Pera...
                  const esNegativo = item.sobrante < 0
                  return (
                    <div key={idx} className={`p-3 rounded-lg text-center border ${esNegativo ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                      <p className="text-xs text-gray-500 font-medium mb-1 truncate">{item.nombre}</p>
                      <p className={`text-2xl font-bold ${esNegativo ? 'text-red-600' : 'text-gray-800'}`}>
                        {item.sobrante % 1 === 0 ? item.sobrante : item.sobrante.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400 mb-2">disponibles</p>
                      
                      {/* Barra de progreso visual */}
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                        <div 
                          className={`h-1.5 rounded-full ${esNegativo ? 'bg-red-500' : 'bg-green-500'}`} 
                          style={{ width: `${Math.max(0, Math.min(100, (item.sobrante / (item.unidadesCompradas / 3)) * 100))}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">de {item.unidadesCompradas} uds</p>
                    </div>
                  )
                })}
                {inventarioDisponible.length === 0 && (
                  <p className="text-gray-500 col-span-full text-center py-4">No has registrado compras en el inventario.</p>
                )}
              </div>
            </div>

            {/* Tabla de Pedidos (Responsiva) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h2 className="font-bold text-gray-700">Lista de Pedidos</h2>
              </div>
              
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="p-3 font-medium">Cliente</th>
                      <th className="p-3 font-medium text-center">Zona / Entrega</th>
                      <th className="p-3 font-medium text-center">Estado</th>
                      <th className="p-3 font-medium text-right">Total</th>
                      <th className="p-3 font-medium text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pedidos.map(pedido => (
                      <tr key={pedido.id} className="hover:bg-gray-50 transition">
                        <td className="p-3">
                          <p className="font-bold text-gray-800">{pedido.clientes?.nombre}</p>
                          <p className="text-xs text-gray-500">{pedido.clientes?.telefono || 'Sin teléfono'}</p>
                        </td>
                        <td className="p-3 text-center">
                          {pedido.clientes?.zonas_entrega ? (
                            <span className="text-xs font-bold px-2 py-1 rounded-full text-white" style={{ backgroundColor: (pedido.clientes.zonas_entrega as any).color }}>
                              📍 {(pedido.clientes.zonas_entrega as any).nombre}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Sin zona</span>
                          )}
                          <p className="text-xs text-gray-500 mt-1 capitalize">{pedido.franja_entrega}</p>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            pedido.estado === 'entregado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {pedido.estado.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-gray-800">${Number(pedido.total).toFixed(2)}</td>
                        <td className="p-3 text-center">
                          <Link href={`/pedido/${pedido.id}`} className="text-blue-600 hover:underline font-medium text-sm">
                            Ver / Editar
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-gray-100">
                {pedidos.map(pedido => (
                  <div key={pedido.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-gray-800 text-lg">{pedido.clientes?.nombre}</p>
                        <p className="text-sm text-gray-500">{pedido.clientes?.telefono || 'Sin teléfono'}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        pedido.estado === 'entregado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {pedido.estado.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 text-sm">
                      {pedido.clientes?.zonas_entrega && (
                        <span className="font-bold px-2 py-1 rounded-full text-white text-xs" style={{ backgroundColor: (pedido.clientes.zonas_entrega as any).color }}>
                          📍 {(pedido.clientes.zonas_entrega as any).nombre}
                        </span>
                      )}
                      <span className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-600 capitalize">
                        🕒 {pedido.franja_entrega}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                      <p className="font-bold text-gray-800 text-xl">${Number(pedido.total).toFixed(2)}</p>
                      <Link href={`/pedido/${pedido.id}`} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm">
                        Ver Detalle →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {pedidos.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  Aún no hay pedidos en este lote. ¡Crea el primero!
                </div>
              )}
            </div>

            {/* Resumen para Embolsar */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
              <div className="p-4 border-b border-gray-200 bg-green-50">
                <h2 className="font-bold text-green-800">📦 Resumen para Embolsar</h2>
                <p className="text-sm text-green-600">Cantidad total de promos a preparar de este lote</p>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {resumenEmbolsar.map((item, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded-lg text-center border border-gray-100">
                    <p className="text-xs text-gray-500 font-medium mb-1 truncate">{item.nombre}</p>
                    <p className="text-2xl font-bold text-gray-800">{item.cantidad}</p>
                    <p className="text-xs text-gray-400">promos</p>
                  </div>
                ))}
                {resumenEmbolsar.length === 0 && (
                  <p className="text-gray-500 col-span-full text-center py-4">No hay productos para embolsar aún.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </ClientWrapper>
  )
}