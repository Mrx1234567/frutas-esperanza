'use client'
import { useEffect, useState } from 'react'
import { createClient } from '../../lib/supabase/client'
import ClientWrapper from '../ClientWrapper'
import Link from 'next/link'

export default function InventarioPage() {
  const [inventario, setInventario] = useState<any[]>([])
  const [loteActivo, setLoteActivo] = useState<any>(null)
  const [ventasPorProducto, setVentasPorProducto] = useState<{ [key: number]: number }>({})
  const [guardando, setGuardando] = useState(false)

  // Estados para el formulario de agregar fruta
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nuevoProdNombre, setNuevoProdNombre] = useState('')
  const [tipoCaja, setTipoCaja] = useState('completa')
  const [costoCaja, setCostoCaja] = useState('')
  const [cantidadTrae, setCantidadTrae] = useState('')
  const [tipoVenta, setTipoVenta] = useState('promocion')
  const [unidadesPorPromo, setUnidadesPorPromo] = useState('3')
  const [precioVenta, setPrecioVenta] = useState('')

  // Estados para edición
  const [editandoItem, setEditandoItem] = useState<any>(null)
  const [editCantidad, setEditCantidad] = useState('')
  const [editMermas, setEditMermas] = useState('')

  const supabase = createClient()

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    const { data: lotes } = await supabase
      .from('lotes').select('*').eq('estado', 'abierto').order('creado_en', { ascending: false }).limit(1)

    if (lotes && lotes.length > 0) {
      const lote = lotes[0]
      setLoteActivo(lote)

      const { data: items } = await supabase
        .from('lote_items')
        .select(`*, productos (*)`)
        .eq('lote_id', lote.id)
      
      if (items) setInventario(items)

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
      setInventario([])
      setVentasPorProducto({})
      cargarDatos()
    }
    setGuardando(false)
  }

  async function agregarProducto(e: React.FormEvent) {
    e.preventDefault()
    if (!loteActivo) return alert('Primero debes iniciar un lote.')
    setGuardando(true)

    // 1. Crear o buscar el producto
    let { data: prodData } = await supabase.from('productos').select('*').eq('nombre', nuevoProdNombre).single()
    
    if (!prodData) {
      const { data: newProd, error: errProd } = await supabase.from('productos').insert([{
        nombre: nuevoProdNombre,
        precio_promo: tipoVenta === 'promocion' ? Number(precioVenta) : Number(precioVenta),
        precio_unitario: tipoVenta === 'promocion' ? Number(precioVenta) / Number(unidadesPorPromo) : null,
        unidades_por_promo: tipoVenta === 'promocion' ? Number(unidadesPorPromo) : 1,
        tipo_venta: tipoVenta,
        unidades_por_caja: Number(cantidadTrae)
      }]).select().single()

      if (errProd) {
        alert('Error al crear producto: ' + errProd.message)
        setGuardando(false)
        return
      }
      prodData = newProd
    }

    // 2. Guardar el item en el lote
    const { error: errItem } = await supabase.from('lote_items').insert([{
      lote_id: loteActivo.id,
      producto_id: prodData.id,
      cajas: tipoCaja === 'completa' ? 1 : 0.5,
      unidades_reales: Number(cantidadTrae),
      costo_caja: Number(costoCaja),
      tipo_caja: tipoCaja,
      mermas: 0
    }])

    if (errItem) alert('Error al guardar en lote: ' + errItem.message)
    else {
      alert('¡Fruta agregada al lote!')
      setMostrarForm(false)
      setNuevoProdNombre('')
      setCostoCaja('')
      setCantidadTrae('')
      setPrecioVenta('')
      cargarDatos()
    }
    setGuardando(false)
  }

  // --- FUNCIÓN PARA EDITAR ---
  function abrirEdicion(item: any) {
    setEditandoItem(item)
    setEditCantidad(item.unidades_reales ? item.unidades_reales.toString() : '')
    setEditMermas(item.mermas ? item.mermas.toString() : '0')
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault()
    if (!editandoItem) return
    setGuardando(true)

    const { error } = await supabase.from('lote_items').update({
      unidades_reales: Number(editCantidad),
      mermas: Number(editMermas)
    }).eq('id', editandoItem.id)

    if (error) alert('Error al actualizar: ' + error.message)
    else {
      setEditandoItem(null)
      cargarDatos()
    }
    setGuardando(false)
  }

  async function cerrarLote() {
    if (!confirm('¿Estás seguro de cerrar este lote? Ya no podrás agregar pedidos a este ciclo.')) return
    setGuardando(true)
    const { error } = await supabase.from('lotes').update({ estado: 'cerrado' }).eq('id', loteActivo.id)
    
    if (error) alert('Error al cerrar: ' + error.message)
    else {
      alert('Lote cerrado con éxito.')
      window.location.reload()
    }
    setGuardando(false)
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

            {/* Formulario para agregar fruta */}
            <div className="bg-white p-4 rounded-xl shadow-sm border">
              <button 
                onClick={() => setMostrarForm(!mostrarForm)}
                className="w-full bg-green-600 text-white p-3 rounded-lg font-bold hover:bg-green-700 mb-4"
              >
                {mostrarForm ? 'Cancelar' : '+ Agregar Fruta al Lote'}
              </button>

              {mostrarForm && (
                <form onSubmit={agregarProducto} className="space-y-4 bg-gray-50 p-4 rounded-lg border">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la fruta</label>
                      <input type="text" value={nuevoProdNombre} onChange={(e) => setNuevoProdNombre(e.target.value)} required className="border p-2 rounded w-full" placeholder="Ej. Manzana verde" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Caja</label>
                      <select value={tipoCaja} onChange={(e) => setTipoCaja(e.target.value)} className="border p-2 rounded w-full bg-white">
                        <option value="completa">Caja Completa</option>
                        <option value="media">Media Caja</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Costo de la caja ($)</label>
                      <input type="number" step="0.01" value={costoCaja} onChange={(e) => setCostoCaja(e.target.value)} required className="border p-2 rounded w-full" placeholder="Ej. 44.00" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">¿Cuánto trae? (Unidades/Libras/Cajitas)</label>
                      <input type="number" value={cantidadTrae} onChange={(e) => setCantidadTrae(e.target.value)} required className="border p-2 rounded w-full" placeholder="Ej. 84" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">¿Cómo se vende?</label>
                      <select value={tipoVenta} onChange={(e) => setTipoVenta(e.target.value)} className="border p-2 rounded w-full bg-white">
                        <option value="promocion">Por Promoción (ej. 3x1.25)</option>
                        <option value="unidad">Por Unidad (ej. 1x0.55)</option>
                        <option value="libras">Por Libras</option>
                        <option value="cajitas">Por Cajitas</option>
                      </select>
                    </div>
                    {tipoVenta === 'promocion' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unidades por promo</label>
                        <input type="number" value={unidadesPorPromo} onChange={(e) => setUnidadesPorPromo(e.target.value)} required className="border p-2 rounded w-full" placeholder="Ej. 3" />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Venta ($)</label>
                      <input type="number" step="0.01" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} required className="border p-2 rounded w-full" placeholder="Ej. 1.25" />
                    </div>
                  </div>
                  <button type="submit" disabled={guardando} className="w-full bg-green-600 text-white p-2 rounded font-bold hover:bg-green-700">Guardar Fruta</button>
                </form>
              )}
            </div>

            {/* Tabla de Inventario */}
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
              <h2 className="text-lg font-semibold text-gray-700">Resumen del Lote</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-150">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="p-2">Producto</th>
                      <th className="p-2 text-center">Entrada</th>
                      <th className="p-2 text-center">Mermas</th>
                      <th className="p-2 text-center">Vendido</th>
                      <th className="p-2 text-center">Sobrante</th>
                      <th className="p-2 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inventario.map(item => {
                      const prod = item.productos
                      const vendido = ventasPorProducto[prod.id] || 0
                      
                      // Cálculo inteligente: si unidades_reales es 0, usamos las cajas * 18 (para uvas) o cajas * unidades
                      let unidadesBase = item.unidades_reales || 0
                      if (unidadesBase === 0 && item.cajas > 0) {
                        // Asumimos 18 si es uva o arándano, o la cantidad de la caja si está definida
                        unidadesBase = item.cajas * (prod.unidades_por_caja || 18) 
                      }

                      const totalDisponible = unidadesBase - (item.mermas || 0)
                      const promosDisponibles = totalDisponible / (prod.unidades_por_promo || 1)
                      const sobrante = promosDisponibles - vendido

                      return (
                        <tr key={item.id}>
                          <td className="p-2 font-medium text-gray-800">
                            {prod.nombre}
                            <span className="block text-xs text-gray-400 font-normal">
                              ({item.tipo_caja === 'completa' ? 'Caja Completa' : 'Media Caja'})
                            </span>
                          </td>
                          <td className="p-2 text-center font-bold text-blue-600">
                            {unidadesBase} 
                            <span className="block text-xs text-gray-400 font-normal">
                              {prod.tipo_venta === 'libras' ? 'libras' : prod.tipo_venta === 'cajitas' ? 'cajitas' : 'unidades'}
                            </span>
                          </td>
                          <td className="p-2 text-center">{item.mermas || 0}</td>
                          <td className="p-2 text-center font-semibold text-blue-600">{vendido}</td>
                          <td className={`p-2 text-center font-bold ${sobrante < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {sobrante % 1 === 0 ? sobrante : sobrante.toFixed(2)}
                          </td>
                          <td className="p-2 text-center">
                            <button onClick={() => abrirEdicion(item)} className="text-blue-600 hover:underline text-sm font-medium">Editar</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE EDICIÓN */}
        {editandoItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
              <h3 className="text-lg font-bold mb-4">Editar: {editandoItem.productos.nombre}</h3>
              <form onSubmit={guardarEdicion} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad de Entrada (Unidades/Libras)</label>
                  <input type="number" value={editCantidad} onChange={(e) => setEditCantidad(e.target.value)} required className="border p-2 rounded w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mermas</label>
                  <input type="number" value={editMermas} onChange={(e) => setEditMermas(e.target.value)} required className="border p-2 rounded w-full" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setEditandoItem(null)} className="flex-1 bg-gray-200 text-gray-700 p-2 rounded font-bold">Cancelar</button>
                  <button type="submit" disabled={guardando} className="flex-1 bg-green-600 text-white p-2 rounded font-bold">Guardar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ClientWrapper>
  )
}