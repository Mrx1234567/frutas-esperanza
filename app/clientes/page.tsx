'use client'
import { useEffect, useState } from 'react'
import { createClient } from '../../lib/supabase/client' // <-- Importación corregida
import ClientWrapper from '../ClientWrapper'

export default function ClientesPage() {
  const [clientes, setClientes] = useState<any[]>([])
  const [zonas, setZonas] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [zonaId, setZonaId] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  // Inicializamos el cliente de Supabase
  const supabase = createClient()

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    // 1. Cargar clientes
    const { data: clientesData, error: errClientes } = await supabase
      .from('clientes')
      .select(`*, zonas_entrega (nombre, color)`)
      .order('nombre')
    
    if (errClientes) {
      console.error("Error cargando clientes:", errClientes)
      alert("Error al cargar clientes: " + JSON.stringify(errClientes))
    } else if (clientesData) {
      setClientes(clientesData)
    }

    // 2. Cargar zonas
    const { data: zonasData, error: errZonas } = await supabase
      .from('zonas_entrega')
      .select('*')
      .order('nombre')
    
    if (errZonas) {
      console.error("Error cargando zonas:", errZonas)
      alert("Error al cargar zonas: " + JSON.stringify(errZonas))
    } else {
      console.log("Zonas cargadas de Supabase:", zonasData)
      setZonas(zonasData || [])
    }
  }

  async function guardarCliente(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre) return
    setCargando(true)

    const clienteData = { 
      nombre, 
      telefono, 
      direccion, 
      zona_id: zonaId ? parseInt(zonaId) : null 
    }

    if (editandoId) {
      const { error } = await supabase.from('clientes').update(clienteData).eq('id', editandoId)
      if (error) alert('Error al editar: ' + error.message)
      else limpiarFormulario()
    } else {
      const { error } = await supabase.from('clientes').insert([clienteData])
      if (error) alert('Error al guardar: ' + error.message)
      else limpiarFormulario()
    }

    cargarDatos()
    setCargando(false)
  }

  function limpiarFormulario() {
    setEditandoId(null)
    setNombre('')
    setTelefono('')
    setDireccion('')
    setZonaId('')
  }

  async function eliminarCliente(id: string, nombreCli: string) {
    if (!confirm(`¿Seguro que quieres eliminar a ${nombreCli}?`)) return
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (error) alert('No se puede eliminar: ' + error.message)
    else cargarDatos()
  }

  function prepararEdicion(cliente: any) {
    setEditandoId(cliente.id)
    setNombre(cliente.nombre)
    setTelefono(cliente.telefono || '')
    setDireccion(cliente.direccion || '')
    setZonaId(cliente.zona_id ? cliente.zona_id.toString() : '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const clientesFiltrados = clientes.filter(c => 
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || 
    (c.telefono && c.telefono.includes(busqueda)) ||
    (c.zonas_entrega && c.zonas_entrega.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  )

  return (
    <ClientWrapper>
      <div className="space-y-6 max-w-5xl mx-auto p-2 sm:p-4">
        <h1 className="text-2xl font-bold text-gray-800">Directorio de Clientes</h1>

        <form onSubmit={guardarCliente} className={`p-4 rounded-xl shadow-sm border space-y-4 ${editandoId ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200'}`}>
          <h2 className="font-semibold text-gray-700 text-lg">
            {editandoId ? 'Editando Cliente' : 'Agregar Nuevo Cliente'}
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1 font-medium">Nombre completo *</label>
              <input type="text" placeholder="Ej. Sofía del Carmen" value={nombre} onChange={(e) => setNombre(e.target.value)} className="border p-3 rounded-lg text-gray-800 bg-white focus:ring-2 focus:ring-green-500 outline-none" required />
            </div>

            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1 font-medium">Teléfono (WhatsApp)</label>
              <input type="text" placeholder="Ej. 7777-7777" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="border p-3 rounded-lg text-gray-800 bg-white focus:ring-2 focus:ring-green-500 outline-none" />
            </div>

            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1 font-medium">Zona de Entrega</label>
              <select value={zonaId} onChange={(e) => setZonaId(e.target.value)} className="border p-3 rounded-lg text-gray-800 bg-white focus:ring-2 focus:ring-green-500 outline-none">
                <option value="">-- Seleccionar Zona --</option>
                {zonas.map(z => (
                  <option key={z.id} value={z.id}>{z.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1 font-medium">Dirección Exacta (opcional)</label>
              <input type="text" placeholder="Ej. Calle Las Flores #12" value={direccion} onChange={(e) => setDireccion(e.target.value)} className="border p-3 rounded-lg text-gray-800 bg-white focus:ring-2 focus:ring-green-500 outline-none" />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button type="submit" disabled={cargando} className={`flex-1 text-white px-4 py-3 rounded-lg font-bold text-lg disabled:opacity-50 transition-colors ${editandoId ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'}`}>
              {cargando ? 'Guardando...' : editandoId ? 'Actualizar Cliente' : 'Guardar Cliente'}
            </button>
            {editandoId && (
              <button type="button" onClick={limpiarFormulario} className="flex-1 bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-bold text-lg hover:bg-gray-300">Cancelar Edición</button>
            )}
          </div>
        </form>

        <div className="relative">
          <input type="text" placeholder="🔍 Buscar por nombre, teléfono o zona..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full border p-4 rounded-xl shadow-sm text-gray-800 focus:ring-2 focus:ring-green-500 outline-none" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {clientesFiltrados.length === 0 && (
              <li className="p-6 text-center text-gray-500">No se encontraron clientes.</li>
            )}
            {clientesFiltrados.map((cliente) => (
              <li key={cliente.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-gray-50 gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-800 text-lg">{cliente.nombre}</p>
                    {cliente.zonas_entrega && (
                      <span className="text-xs font-bold px-2 py-1 rounded-full text-white" style={{ backgroundColor: cliente.zonas_entrega.color || '#3B82F6' }}>
                        📍 {cliente.zonas_entrega.nombre}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    📞 {cliente.telefono || 'Sin teléfono'} {cliente.direccion ? `• 🏠 ${cliente.direccion}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 self-end sm:self-auto">
                  <button onClick={() => prepararEdicion(cliente)} className="p-3 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Editar">✏️ Editar</button>
                  <button onClick={() => eliminarCliente(cliente.id, cliente.nombre)} className="p-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition" title="Eliminar">🗑️</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ClientWrapper>
  )
}