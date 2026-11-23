'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { createClient } from '../../lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import ClientWrapper from '../ClientWrapper'

function NuevoPedidoForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pedidoId = searchParams.get('pedidoId')
  const esEdicion = !!pedidoId

  const supabase = useMemo(() => createClient(), [])

  const [clientes, setClientes] = useState<any[]>([])
  const [productos, setProductos] = useState<any[]>([])
  const [loteId, setLoteId] = useState('')
  
  const [clienteId, setClienteId] = useState('')
  const [franjaEntrega, setFranjaEntrega] = useState('mañana')
  const [notas, setNotas] = useState('')
  
  // Estados para cantidades
  const [cantidades, setCantidades] = useState<{ [key: string]: number }>({})
  const [cantidadesSueltas, setCantidadesSueltas] = useState<{ [key: string]: number }>({}) // Para naranjas sueltas
  const [cantidadesOriginales, setCantidadesOriginales] = useState<{ [key: string]: number }>({})
  
  const [cargando, setCargando] = useState(false)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    cargarDatos()
  }, [pedidoId])

  async function cargarDatos() {
    // 1. Cargar clientes
    const { data: clientesData } = await supabase.from('clientes').select('*, zonas_entrega(nombre)').order('nombre')
    if (clientesData) setClientes(clientesData)

    // 2. Cargar productos
    const { data: productosData } = await supabase.from('productos').select('*').order('id')
    if (productosData) {
      setProductos(productosData)
      const inicial: { [key: string]: number } = {}
      const inicialSueltas: { [key: string]: number } = {}
      productosData.forEach(p => {
        inicial[p.id] = 0
        inicialSueltas[p.id] = 0
      })
      setCantidades(inicial)
      setCantidadesSueltas(inicialSueltas)
      setCantidadesOriginales(inicial)
    }

    // 3. Lógica de Lote y Edición
    if (!esEdicion) {
      const { data: lotesData } = await supabase.from('lotes').select('*').eq('estado', 'abierto').order('id', { ascending: false }).limit(1)
      if (lotesData && lotesData.length > 0) setLoteId(lotesData[0].id.toString())
    } else {
      const { data: pedidoData } = await supabase
        .from('pedidos')
        .select(`*, pedido_items(producto_id, cantidad_promos)`)
        .eq('id', pedidoId)
        .single()

      if (pedidoData) {
        setClienteId(pedidoData.cliente_id.toString())
        setLoteId(pedidoData.lote_id.toString())
        setFranjaEntrega(pedidoData.franja_entrega || 'mañana')
        setNotas(pedidoData.notas || '')

        const cantTemp: { [key: string]: number } = {}
        const cantSueltasTemp: { [key: string]: number } = {}

        pedidoData.pedido_items.forEach((item: any) => {
          // Si la cantidad tiene decimales, significa que son naranjas sueltas
          if (item.cantidad_promos % 1 !== 0) {
            const promosEnteras = Math.floor(item.cantidad_promos)
            const fraccion = item.cantidad_promos - promosEnteras
            const sueltas = Math.round(fraccion * 3) // Asumiendo promo de 3 naranjas
            
            cantTemp[item.producto_id] = promosEnteras
            cantSueltasTemp[item.producto_id] = sueltas
          } else {
            cantTemp[item.producto_id] = item.cantidad_promos
            cantSueltasTemp[item.producto_id] = 0
          }
        })

        setCantidades(prev => ({ ...prev, ...cantTemp }))
        setCantidadesSueltas(prev => ({ ...prev, ...cantSueltasTemp }))
        setCantidadesOriginales(cantTemp)
      }
    }
  }

  // Recalcular total considerando las sueltas
  useEffect(() => {
    let nuevoTotal = 0
    productos.forEach(prod => {
      const cantPromo = cantidades[prod.id] || 0
      const cantSuelta = cantidadesSueltas[prod.id] || 0
      
      nuevoTotal += cantPromo * prod.precio_promo
      // Si es naranja, sumamos las sueltas a 0.55
      if (prod.nombre.includes('Naranja') && cantSuelta > 0) {
        nuevoTotal += cantSuelta * 0.55
      }
    })
    setTotal(nuevoTotal)
  }, [cantidades, cantidadesSueltas, productos])

  const cambiarCantidad = (prodId: string, delta: number, esSuelta: boolean = false) => {
    if (esSuelta) {
      setCantidadesSueltas(prev => {
        const nueva = (prev[prodId] || 0) + delta
        return { ...prev, [prodId]: nueva < 0 ? 0 : nueva }
      })
    } else {
      setCantidades(prev => {
        const nueva = (prev[prodId] || 0) + delta
        return { ...prev, [prodId]: nueva < 0 ? 0 : nueva }
      })
    }
  }

  async function guardarPedido(e: React.FormEvent) {
    e.preventDefault()
    if (!clienteId || !loteId) return alert('Selecciona un cliente y asegúrate de tener un lote abierto.')
    
    setCargando(true)

    // Preparamos los items para insertar
    const itemsAInsertar: any[] = []
    
    productos.forEach(p => {
      const cantPromo = cantidades[p.id] || 0
      const cantSuelta = cantidadesSueltas[p.id] || 0
      
      if (cantPromo > 0 || cantSuelta > 0) {
        let cantidadTotal = cantPromo
        
        // Si es naranja y hay sueltas, las sumamos como fracción a la cantidad de promos
        if (p.nombre.includes('Naranja') && cantSuelta > 0) {
          cantidadTotal += (cantSuelta / 3)
        }

        itemsAInsertar.push({
          producto_id: p.id,
          cantidad_promos: cantidadTotal,
          precio_unitario: p.precio_promo,
          subtotal: (cantPromo * p.precio_promo) + (cantSuelta > 0 ? cantSuelta * 0.55 : 0)
        })
      }
    })

    if (itemsAInsertar.length === 0) {
      alert('Selecciona al menos una fruta.')
      setCargando(false)
      return
    }

    if (esEdicion) {
      // --- MODO EDICIÓN ---
      const { error: pedidoError } = await supabase
        .from('pedidos')
        .update({ franja_entrega: franjaEntrega, notas: notas })
        .eq('id', pedidoId)

      if (pedidoError) {
        alert('Error al actualizar pedido: ' + pedidoError.message)
        setCargando(false)
        return
      }

      await supabase.from('pedido_items').delete().eq('pedido_id', pedidoId)
      const { error: itemsError } = await supabase.from('pedido_items').insert(
        itemsAInsertar.map(item => ({ ...item, pedido_id: pedidoId }))
      )
      
      if (itemsError) alert('Error al guardar items: ' + itemsError.message)
      else {
        alert('¡Pedido actualizado con éxito!')
        router.push(`/pedido/${pedidoId}`)
      }

    } else {
      // --- MODO NUEVO ---
      const { data: pedidoData, error: pedidoError } = await supabase
        .from('pedidos')
        .insert([{ 
          cliente_id: clienteId, 
          lote_id: loteId, 
          franja_entrega: franjaEntrega,
          notas: notas,
          estado: 'apartado'
        }])
        .select()
        .single()

      if (pedidoError) {
        alert('Error al crear pedido: ' + pedidoError.message)
        setCargando(false)
        return
      }

      const { error: itemsError } = await supabase.from('pedido_items').insert(
        itemsAInsertar.map(item => ({ ...item, pedido_id: pedidoData.id }))
      )
      
      if (itemsError) {
        alert('Error al guardar items: ' + itemsError.message)
      } else {
        alert('¡Pedido guardado con éxito!')
        router.push('/')
      }
    }
    setCargando(false)
  }

  return (
    <ClientWrapper>
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          {esEdicion ? 'Editar Pedido' : 'Nuevo Pedido'}
        </h1>

        <form onSubmit={guardarPedido} className="space-y-6">
          
          <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Cliente</label>
              <select 
                value={clienteId} 
                onChange={(e) => setClienteId(e.target.value)}
                className="border p-3 rounded-lg bg-white"
                required
                disabled={esEdicion}
              >
                <option value="">-- Seleccionar Cliente --</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre} {c.zonas_entrega ? `(${c.zonas_entrega.nombre})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Franja de Entrega</label>
              <select 
                value={franjaEntrega} 
                onChange={(e) => setFranjaEntrega(e.target.value)}
                className="border p-3 rounded-lg bg-white"
              >
                <option value="mañana">Mañana (antes del trabajo)</option>
                <option value="tarde">Tarde (después de las 6pm)</option>
                <option value="esta semana">En el transcurso de la semana</option>
              </select>
            </div>
          </div>

          {/* Productos */}
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <h2 className="font-semibold text-gray-700 mb-3">Productos</h2>
            <div className="space-y-3">
              {productos.map(prod => {
                const cantActual = cantidades[prod.id] || 0
                const cantSueltaActual = cantidadesSueltas[prod.id] || 0
                const esNaranja = prod.nombre.includes('Naranja')

                return (
                  <div key={prod.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-800">{prod.nombre}</p>
                        <p className="text-sm text-gray-500">
                          ${prod.precio_promo.toFixed(2)} {prod.unidades_por_promo > 1 ? `(Promo de ${prod.unidades_por_promo})` : '(Libra/Cajita)'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => cambiarCantidad(prod.id, -1)} className="w-10 h-10 bg-white border rounded-lg text-xl font-bold text-gray-600 hover:bg-gray-100">-</button>
                        <span className="w-8 text-center font-bold text-lg">{cantActual}</span>
                        <button type="button" onClick={() => cambiarCantidad(prod.id, 1)} className="w-10 h-10 bg-green-100 border border-green-300 rounded-lg text-xl font-bold text-green-700 hover:bg-green-200">+</button>
                      </div>
                    </div>

                    {/* Si es Naranja, mostrar la opción de unidades sueltas */}
                    {esNaranja && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-600">Unidades sueltas ($0.55 c/u)</p>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => cambiarCantidad(prod.id, -1, true)} className="w-8 h-8 bg-white border rounded-lg text-lg font-bold text-gray-600 hover:bg-gray-100">-</button>
                          <span className="w-6 text-center font-bold text-md">{cantSueltaActual}</span>
                          <button type="button" onClick={() => cambiarCantidad(prod.id, 1, true)} className="w-8 h-8 bg-blue-100 border border-blue-300 rounded-lg text-lg font-bold text-blue-700 hover:bg-blue-200">+</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Notas y Total */}
          <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
              <textarea 
                value={notas} 
                onChange={(e) => setNotas(e.target.value)}
                className="border p-3 rounded-lg bg-white"
                rows={2}
                placeholder="Ej. Dejar en portería, avisar al llegar..."
              />
            </div>
            
            <div className="flex justify-between items-center bg-green-50 p-4 rounded-lg border border-green-200">
              <span className="text-lg font-semibold text-green-800">Total a Pagar:</span>
              <span className="text-2xl font-bold text-green-700">${total.toFixed(2)}</span>
            </div>

            <button 
              type="submit" 
              disabled={cargando}
              className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              {cargando ? 'Guardando...' : esEdicion ? 'Actualizar Pedido' : 'Guardar Pedido'}
            </button>
          </div>
        </form>
      </div>
    </ClientWrapper>
  )
}

// Esto va al final de todo el archivo
export default function NuevoPedidoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Cargando formulario...</p>
        </div>
      </div>
    }>
      <NuevoPedidoForm />
    </Suspense>
  )
}