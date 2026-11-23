'use client'
import { useEffect, useState, Suspense } from 'react'
import { createClient } from '../../../lib/supabase/client' // <-- Ruta corregida
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ClientWrapper from '../../ClientWrapper' // <-- Añadido

function DetallePedidoContenido() {
  const params = useParams()
  const router = useRouter()
  const [pedido, setPedido] = useState<any>(null)
  const [productos, setProductos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function cargar() {
      const { data: prod } = await supabase.from('productos').select('*')
      if (prod) setProductos(prod)

      const { data: ped } = await supabase
        .from('pedidos')
        .select(`
          *,
          clientes ( id, nombre, telefono ),
          pedido_items ( cantidad_promos, producto_id, subtotal )
        `)
        .eq('id', params.id)
        .single()
      
      if (ped) setPedido(ped)
      setCargando(false)
    }
    cargar()
  }, [params.id])

  async function cambiarEstado(nuevoEstado: string) {
    const { error } = await supabase
      .from('pedidos')
      .update({ estado: nuevoEstado })
      .eq('id', params.id)

    if (!error) {
      alert(`Pedido marcado como: ${nuevoEstado}`)
      router.push('/') 
    }
  }

  function abrirWhatsApp() {
    if (!pedido?.clientes?.telefono) return alert('Este cliente no tiene teléfono guardado.')
    const numLimpio = pedido.clientes.telefono.replace(/\D/g, '')
    const numConPais = numLimpio.length === 8 ? `503${numLimpio}` : numLimpio
    const total = pedido.pedido_items.reduce((sum: number, item: any) => sum + Number(item.subtotal), 0)
    
    const mensaje = `Hola estimado cliente, tu pedido en Frutas Esperanza está listo. Total a pagar: $${total.toFixed(2)}.${pedido.notas ? `\n\nTe esperamos el día acordado: ${pedido.notas}.` : ''}`
    
    window.open(`https://wa.me/${numConPais}?text=${encodeURIComponent(mensaje)}`, '_blank')
  }

  if (cargando) return <div className="text-center p-10 text-gray-500">Cargando detalle...</div>
  if (!pedido) return <div className="text-center p-10 text-red-500">Pedido no encontrado</div>

  const totalPedido = pedido.pedido_items.reduce((sum: number, item: any) => sum + Number(item.subtotal), 0)

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <Link href="/" className="text-gray-500 hover:text-gray-800 font-bold text-xl bg-gray-100 w-10 h-10 flex items-center justify-center rounded-full">←</Link>
        <h1 className="text-2xl font-bold text-gray-800">Detalle del Pedido</h1>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-gray-500 font-medium uppercase tracking-wide">Cliente</p>
            <p className="text-xl font-bold text-gray-800">{pedido.clientes?.nombre}</p>
            <p className="text-gray-600">{pedido.clientes?.telefono || 'Sin teléfono'}</p>
            
            {pedido.notas && (
              <p className="text-sm font-medium text-orange-600 bg-orange-50 p-2 rounded mt-2 inline-block">
                📅 Entrega: {pedido.notas}
              </p>
            )}
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${pedido.estado === 'entregado' ? 'bg-green-100 text-green-800' : pedido.estado === 'cancelado' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
            {pedido.estado.toUpperCase()}
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm text-gray-500 font-medium mb-3">Productos</p>
          <ul className="space-y-3">
            {pedido.pedido_items.map((item: any, index: number) => {
              const prod = productos.find(p => p.id === item.producto_id)
              const formatearCantidad = (cant: number) => {
                if (cant % 1 !== 0) {
                  const enteros = Math.floor(cant)
                  const fraccion = cant - enteros
                  const sueltas = Math.round(fraccion * (prod?.unidades_por_promo || 1))
                  return `${enteros > 0 ? enteros + ' P + ' : ''}${sueltas} S`
                }
                return cant
              }

              return (
                <li key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                  <span className="font-medium text-gray-700">
                    {formatearCantidad(item.cantidad_promos)}x {prod?.nombre}
                  </span>
                  <span className="font-bold text-gray-800">${Number(item.subtotal).toFixed(2)}</span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="border-t pt-4 flex justify-between items-center">
          <p className="font-bold text-gray-800 text-lg">Total a pagar:</p>
          <p className="font-bold text-green-700 text-3xl">${totalPedido.toFixed(2)}</p>
        </div>
      </div>

      {pedido.estado === 'apartado' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link 
            href={`/nuevo-pedido?pedidoId=${pedido.id}`} 
            className="bg-orange-500 text-white p-4 rounded-lg font-bold hover:bg-orange-600 flex justify-center items-center gap-2 sm:col-span-2 shadow-sm text-lg"
          >
            ➕ Agregar más productos a este pedido
          </Link>
          <button onClick={abrirWhatsApp} className="bg-green-500 text-white p-4 rounded-lg font-bold hover:bg-green-600 flex justify-center items-center gap-2 shadow-sm">
            💬 Enviar WhatsApp
          </button>
          <button onClick={() => cambiarEstado('entregado')} className="bg-blue-600 text-white p-4 rounded-lg font-bold hover:bg-blue-700 shadow-sm">
            ✅ Marcar Entregado
          </button>
          <button onClick={() => cambiarEstado('cancelado')} className="bg-red-100 text-red-700 p-3 rounded-lg font-bold hover:bg-red-200 col-span-1 sm:col-span-2">
            ❌ Cancelar Pedido
          </button>
        </div>
      ) : (
        <div className={`p-6 rounded-lg text-center font-bold border-2 ${pedido.estado === 'entregado' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {pedido.estado === 'entregado' ? '✅ Este pedido ya fue entregado' : '❌ Este pedido fue cancelado'}
          <br />
          <Link href="/" className="text-sm font-normal mt-2 inline-block hover:underline">Volver al inicio</Link>
        </div>
      )}
    </div>
  )
}

export default function DetallePedidoPage() {
  return (
    <ClientWrapper>
      <div className="min-h-screen">
        <Suspense fallback={<div className="p-10 text-center text-gray-500">Cargando datos...</div>}>
          <DetallePedidoContenido />
        </Suspense>
      </div>
    </ClientWrapper>
  )
}