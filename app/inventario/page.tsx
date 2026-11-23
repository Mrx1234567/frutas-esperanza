'use client'
import { useEffect, useState } from 'react'
import { createClient } from '../../lib/supabase/client'
import ClientWrapper from '../ClientWrapper'
import Link from 'next/link'

export default function InventarioPage() {
  const [productos, setProductos] = useState<any[]>([])
  const [loteActivo, setLoteActivo] = useState<any>(null)
  
  // Guardamos cajas y unidades reales
  const [inventario, setInventario] = useState<{ [key: number]: { cajas: number, unidades_reales: number, mermas: number } }>({})
  const [ventasPorProducto, setVentasPorProducto] = useState<{ [key: number]: number }>({})
  const [guardando, setGuardando] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    const { data: prods } = await supabase.from('productos').select('*').order('id')
    if (prods) setProductos(prods)

    const { data: lotes } = await supabase
      .from('lotes').select('*').eq('estado', 'abierto').order('creado_en', { ascending: false }).limit(1)

    if (lotes && lotes.length > 0) {
      const lote = lotes[0]
      setLoteActivo(lote)

      const { data: items } = await supabase.from('lote_items').select('*').eq('lote_id', lote.id)
      if (items) {
        const invTemp: any = {}
        items.forEach(item => {
          invTemp[item.producto_id] = { 
            cajas: item.cajas || 0,
            unidades_reales: item.unidades_reales || 0, 
            mermas: item.mermas || 0 
          }
        })
        setInventario(invTemp)
      }

      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('estado, pedido_items(producto_id, cantidad_promos)')
        .eq('lote_id', lote.id)
        .neq('estado', 'cancelado')

      if (pedidos) {
        const ventasTemp: any = {}
        pedidos.forEach(pedido => {
          pedido.pedido_items.forEach((item: any) => {
            ventasTemp[item.producto_id] = (ventasTemp[item.producto_id] || 0) + item.cantidad_promos
          })
        })
        setVentasPorProducto(ventasTemp)
      }
    }
  }

  async function iniciarNuevoLote() {
    if (!confirm('¿Seguro que quieres iniciar un nuevo lote? Asegúrate de haber cerrado el anterior.')) return
    setGuardando(true)
    const { data, error } = await supabase.from('lotes').insert([{ estado: 'abierto', notas: 'Lote creado' }]).select().single()
    if (error) alert('Error: ' + error.message)
    else {
      setLoteActivo(data)
      setInventario({})
      setVentasPorProducto({})
      cargarDatos()
    }
    setGuardando(false)
  }

  async function guardarInventario() {
    if (!loteActivo) return alert('Primero debes iniciar un lote.')
    setGuardando(true)
    
    const itemsAGuardar = Object.entries(inventario).map(([prodId, datos]) => ({
      lote_id: loteActivo.id,
      producto_id: Number(prodId),
      cajas: datos.cajas,
      unidades_reales: datos.unidades_reales,
      mermas: datos.mermas
    }))

    await supabase.from('lote_items').delete().eq('lote_id', loteActivo.id)
    const { error } = await supabase.from('lote_items').insert(itemsAGuardar)
    if (error) alert('Error al guardar: ' + error.message)
    else alert('¡Inventario guardado!')
    setGuardando(false)
  }

  async function cerrarLote() {
    if (!confirm('¿Estás seguro de cerrar este lote? Ya no podrás agregar pedidos a este ciclo.')) return
    setGuardando(true)
    const { error } = await supabase.from('lotes').update({ estado: 'cerrado' }).eq('id', loteActivo.id)
    
    if (error) alert('Error al cerrar: ' + error.message)
    else {
      alert('Lote cerrado con éxito. La pantalla de inicio se limpiará para el próximo ciclo.')
      window.location.reload()
    }
    setGuardando(false)
  }

  const handleInput = (prodId: number, campo: 'cajas' | 'unidades_reales' | 'mermas', valor: string) => {
    const num = Number(valor) || 0
    setInventario(prev => ({
      ...prev,
      [prodId]: {
        cajas: prev[prodId]?.cajas || 0,
        unidades_reales: prev[prodId]?.unidades_reales || 0,
        mermas: prev[prodId]?.mermas || 0,
        [campo]: num
      }
    }))
  }

  return (
    <ClientWrapper>
      <div className="space-y-6 max-w-4xl mx-auto p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Inventario y Sobrantes</h1>
          <Link href="/" className="text-green-600 font-medium hover:underline text-sm">Volver al inicio</Link>
        </div>

        {!loteActivo ? (
          <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg text-center space-y-4">
            <p className="text-yellow-800 font-medium">No hay ningún lote abierto.</p>
            <button onClick={iniciarNuevoLote} disabled={guardando} className="bg-yellow-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-yellow-700">
              Iniciar Nuevo Lote
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-green-50 p-3 rounded text-green-800 text-sm font-medium flex justify-between items-center">
              <span>Lote Activo: {new Date(loteActivo.creado_en).toLocaleDateString()}</span>
              <button onClick={cerrarLote} className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700 font-bold">
                Cerrar Lote
              </button>
            </div>

            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
              <h2 className="text-lg font-semibold text-gray-700">Control de Inventario</h2>
              <p className="text-sm text-gray-500 mb-2">
                Para Uvas y Arándanos anota las cajas exactas. Para Mandarinas, Peras y Naranjas anota las unidades reales contadas.
              </p>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[600px]">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="p-2">Producto</th>
                      <th className="p-2 text-center">Entrada</th>
                      <th className="p-2 text-center">Mermas</th>
                      <th className="p-2 text-center">Vendido</th>
                      <th className="p-2 text-center">Sobrante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {productos.map(prod => {
                      const cajas = inventario[prod.id]?.cajas || 0
                      const unidadesReales = inventario[prod.id]?.unidades_reales || 0
                      const mermas = inventario[prod.id]?.mermas || 0
                      const vendido = ventasPorProducto[prod.id] || 0
                      
                      // Determinar si es producto de "caja fija" (Uvas y Arándanos)
                      const esCajaFija = prod.nombre.includes('Uva') || prod.nombre.includes('Arándano')
                      
                      let totalDisponible = 0
                      if (esCajaFija) {
                        // Uvas y arándanos: 18 unidades por caja
                        totalDisponible = (cajas * 18) - mermas
                      } else {
                        // Mandarinas, peras y naranjas: usamos las unidades reales
                        totalDisponible = unidadesReales - mermas
                      }
                      
                      const promosDisponibles = totalDisponible / prod.unidades_por_promo
                      const sobrante = promosDisponibles - vendido

                      return (
                        <tr key={prod.id}>
                          <td className="p-2 font-medium text-gray-800">
                            {prod.nombre}
                            <span className="block text-xs text-gray-400 font-normal">
                              {esCajaFija ? '(Caja fija de 18)' : '(Conteo variable)'}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            {esCajaFija ? (
                              // Entrada para cajas fijas
                              <div className="flex flex-col items-center">
                                <input 
                                  type="number" min="0"
                                  value={cajas || ''}
                                  onChange={(e) => handleInput(prod.id, 'cajas', e.target.value)}
                                  className="border p-2 rounded w-24 text-center text-gray-800 font-bold bg-blue-50"
                                  placeholder="Cajas"
                                />
                                <span className="text-xs text-gray-500 mt-1">{cajas * 18} unidades</span>
                              </div>
                            ) : (
                              // Entrada para conteo variable
                              <input 
                                type="number" min="0"
                                value={unidadesReales || ''}
                                onChange={(e) => handleInput(prod.id, 'unidades_reales', e.target.value)}
                                className="border p-2 rounded w-24 text-center text-gray-800 font-bold bg-blue-50"
                                placeholder="Unidades"
                              />
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <input 
                              type="number" min="0"
                              value={mermas || ''}
                              onChange={(e) => handleInput(prod.id, 'mermas', e.target.value)}
                              className="border p-2 rounded w-20 text-center text-gray-800"
                              placeholder="0"
                            />
                          </td>
                          <td className="p-2 text-center font-semibold text-blue-600">{vendido}</td>
                          <td className={`p-2 text-center font-bold ${sobrante < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {sobrante % 1 === 0 ? sobrante : sobrante.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <button onClick={guardarInventario} disabled={guardando} className="w-full bg-gray-800 text-white p-3 rounded-lg font-bold hover:bg-gray-900">
                Guardar Inventario
              </button>
            </div>
          </div>
        )}
      </div>
    </ClientWrapper>
  )
}