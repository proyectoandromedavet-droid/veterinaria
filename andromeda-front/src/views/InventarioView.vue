<template>
  <div class="page">

    <div class="page-header">
      <div class="page-header__left">
        <span class="page-emoji">📦</span>
        <div>
          <h2 class="page-title">Inventario</h2>
          <p class="page-sub">Stock de medicamentos e insumos</p>
        </div>
      </div>
      <!-- Tab-level action buttons -->
      <button v-if="activeTab === 'products'" class="btn-primary" @click="openModal()">+ Agregar producto</button>
      <button v-if="activeTab === 'suppliers'" class="btn-primary" @click="openSupplierModal()">+ Nuevo proveedor</button>
      <button v-if="activeTab === 'orders'" class="btn-primary" @click="openOrderModal()">+ Nueva OC</button>
    </div>

    <!-- Tab navigation -->
    <div class="tab-nav">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === tab.key }"
        @click="setTab(tab.key)"
      >
        {{ tab.label }}
        <span v-if="tab.key === 'alerts' && alerts.length > 0" class="tab-badge">{{ alerts.length }}</span>
      </button>
    </div>

    <!-- ======================================================= -->
    <!-- TAB: PRODUCTOS                                          -->
    <!-- ======================================================= -->
    <template v-if="activeTab === 'products'">
      <!-- Alertas de stock bajo -->
      <div v-if="lowStock.length > 0" class="stock-alert">
        <span>⚠️</span>
        <span><strong>{{ lowStock.length }} producto{{ lowStock.length > 1 ? 's' : '' }}</strong> con stock bajo: {{ lowStock.slice(0,3).map(p => p.name).join(', ') }}{{ lowStock.length > 3 ? '…' : '' }}</span>
      </div>

      <!-- Filtros -->
      <div class="filters">
        <input v-model.trim="search" type="search" placeholder="🔍 Buscar producto…" class="filter-input filter-input--grow" @input="debouncedLoad()" />
        <select v-model="categoryFilter" class="filter-select" @change="load()">
          <option value="">Todas las categorías</option>
          <option value="medication">💊 Medicamentos</option>
          <option value="vaccine">💉 Vacunas</option>
          <option value="supply">📦 Insumos</option>
          <option value="food">🦴 Alimentos</option>
          <option value="equipment">🔧 Equipamiento</option>
          <option value="other">📦 Otros</option>
        </select>
        <select v-model="stockFilter" class="filter-select" @change="load()">
          <option value="">Todo el stock</option>
          <option value="low">⚠️ Stock bajo</option>
          <option value="zero">🔴 Sin stock</option>
        </select>
      </div>

      <div v-if="loading" class="loading-state"><span class="spin spin--dark" /> Cargando inventario…</div>
      <div v-else-if="error" class="alert alert--error">{{ error }}</div>
      <div v-else-if="items.length === 0" class="empty-state">
        <span class="empty-state__emoji">📦</span>
        <p>No hay productos en el inventario</p>
      </div>

      <div v-else class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Stock actual</th>
              <th>Stock mín.</th>
              <th>Precio venta</th>
              <th>Vencimiento</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in items" :key="p.id" :class="{ 'row--low': isLow(p), 'row--out': isOut(p) }">
              <td>
                <div>
                  <strong>{{ p.name }}</strong>
                  <span class="sub">{{ p.sku || p.code || '' }}</span>
                </div>
              </td>
              <td><span class="cat-badge" :style="catStyle(p.item_type)">{{ catLabel(p.item_type) }}</span></td>
              <td>
                <strong :class="isLow(p) ? 'text-warn' : isOut(p) ? 'text-danger' : ''">
                  {{ p.quantity_available ?? '—' }}
                </strong>
              </td>
              <td class="sub">{{ p.minimum_stock ?? '—' }}</td>
              <td class="sub">{{ p.sale_price != null ? '$' + p.sale_price : '—' }}</td>
              <td :class="expClass(p.expiry_date)">{{ formatDate(p.expiry_date) }}</td>
              <td>
                <span class="badge" :class="stockBadge(p)">{{ stockLabel(p) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="pagination.totalPages > 1" class="pagination">
        <button :disabled="pagination.page <= 1" @click="load(pagination.page - 1)">← Ant.</button>
        <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
        <button :disabled="pagination.page >= pagination.totalPages" @click="load(pagination.page + 1)">Sig. →</button>
      </div>
    </template>

    <!-- ======================================================= -->
    <!-- TAB: ALERTAS                                            -->
    <!-- ======================================================= -->
    <template v-if="activeTab === 'alerts'">
      <div v-if="alertsLoading" class="loading-state"><span class="spin spin--dark" /> Cargando alertas…</div>
      <div v-else-if="alertsError" class="alert alert--error">{{ alertsError }}</div>
      <div v-else-if="alerts.length === 0" class="empty-state">
        <span class="empty-state__emoji">✅</span>
        <p>No hay alertas activas</p>
      </div>
      <div v-else class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Tipo de alerta</th>
              <th>Stock actual</th>
              <th>Umbral</th>
              <th>Fecha</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in alerts" :key="a.id">
              <td><strong>{{ a.item_name }}</strong></td>
              <td class="sub">{{ a.sku || '—' }}</td>
              <td><span class="badge" :class="alertBadgeClass(a.alert_type)">{{ alertLabel(a.alert_type) }}</span></td>
              <td>{{ a.current_stock ?? '—' }}</td>
              <td>{{ a.threshold ?? '—' }}</td>
              <td>{{ a.expiry_date ? formatDate(a.expiry_date) : formatDate(a.created_at) }}</td>
              <td>
                <button class="btn-sm btn-sm--ghost" :disabled="resolvingAlert === a.id" @click="resolveAlert(a.id)">
                  <span v-if="resolvingAlert === a.id" class="spin spin--sm spin--dark" />
                  <span v-else>Resolver</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ======================================================= -->
    <!-- TAB: PROVEEDORES                                        -->
    <!-- ======================================================= -->
    <template v-if="activeTab === 'suppliers'">
      <div v-if="suppliersLoading" class="loading-state"><span class="spin spin--dark" /> Cargando proveedores…</div>
      <div v-else-if="suppliersError" class="alert alert--error">{{ suppliersError }}</div>
      <div v-else-if="suppliers.length === 0" class="empty-state">
        <span class="empty-state__emoji">🚚</span>
        <p>No hay proveedores registrados</p>
      </div>
      <div v-else class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>CUIT/ID fiscal</th>
              <th>Contacto</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Plazo pago (días)</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in suppliers" :key="s.id">
              <td><strong>{{ s.name }}</strong></td>
              <td class="sub">{{ s.tax_id || '—' }}</td>
              <td>{{ s.contact_name || '—' }}</td>
              <td>{{ s.email || '—' }}</td>
              <td>{{ s.phone || '—' }}</td>
              <td>{{ s.payment_terms ?? '—' }}</td>
              <td>
                <div class="action-btns">
                  <button class="btn-sm btn-sm--icon" title="Editar" @click="openSupplierModal(s)">✏️</button>
                  <button class="btn-sm btn-sm--danger" :disabled="deletingSupplier === s.id" @click="deleteSupplier(s.id)">
                    <span v-if="deletingSupplier === s.id" class="spin spin--sm spin--dark" />
                    <span v-else>Eliminar</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ======================================================= -->
    <!-- TAB: ÓRDENES DE COMPRA                                  -->
    <!-- ======================================================= -->
    <template v-if="activeTab === 'orders'">
      <div v-if="ordersLoading" class="loading-state"><span class="spin spin--dark" /> Cargando órdenes de compra…</div>
      <div v-else-if="ordersError" class="alert alert--error">{{ ordersError }}</div>
      <div v-else-if="orders.length === 0" class="empty-state">
        <span class="empty-state__emoji">🛒</span>
        <p>No hay órdenes de compra</p>
      </div>
      <div v-else class="card">
        <table class="table">
          <thead>
            <tr>
              <th>N° OC</th>
              <th>Proveedor</th>
              <th>Estado</th>
              <th>Fecha pedido</th>
              <th>Fecha esperada</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in orders" :key="o.id">
              <td><strong>#{{ o.id }}</strong></td>
              <td>{{ supplierNameStable(o.supplier_id) }}</td>
              <td><span class="badge" :class="orderStatusClass(o.status)">{{ orderStatusLabel(o.status) }}</span></td>
              <td>{{ formatDate(o.ordered_date) }}</td>
              <td>{{ formatDate(o.expected_date) }}</td>
              <td>{{ o.total != null ? '$' + Number(o.total).toFixed(2) : '—' }}</td>
              <td>
                <div class="action-btns">
                  <button
                    v-if="o.status === 'draft'"
                    class="btn-sm btn-sm--primary"
                    :disabled="actioningOrder === o.id"
                    @click="sendOrder(o.id)"
                  >
                    <span v-if="actioningOrder === o.id" class="spin spin--sm spin--dark" />
                    <span v-else>Enviar</span>
                  </button>
                  <button
                    v-if="o.status === 'draft' || o.status === 'sent'"
                    class="btn-sm btn-sm--danger"
                    :disabled="actioningOrder === o.id"
                    @click="cancelOrder(o.id)"
                  >
                    <span v-if="actioningOrder === o.id" class="spin spin--sm spin--dark" />
                    <span v-else>Cancelar</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ======================================================= -->
    <!-- MODAL: NUEVO PRODUCTO                                   -->
    <!-- ======================================================= -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal()">
        <div class="modal">
          <div class="modal__header">
            <h3>📦 Nuevo producto</h3>
            <button type="button" class="modal__close" @click="closeModal()">✕</button>
          </div>
          <form @submit.prevent="handleCreate" novalidate>
            <div class="form-body">
              <div class="form-grid">
                <div class="field field--full">
                  <label>Nombre del producto <span class="req">*</span></label>
                  <input v-model.trim="form.name" type="text" placeholder="Amoxicilina 500mg" :disabled="saving" required />
                  <span v-if="fe.name" class="field-error">{{ fe.name }}</span>
                </div>
                <div class="field">
                  <label>Tipo <span class="req">*</span></label>
                  <select v-model="form.category" :disabled="saving" required>
                    <option value="">Seleccioná…</option>
                    <option value="medication">💊 Medicamento</option>
                    <option value="vaccine">💉 Vacuna</option>
                    <option value="supply">📦 Insumo</option>
                    <option value="food">🦴 Alimento</option>
                    <option value="equipment">🔧 Equipamiento</option>
                    <option value="other">📦 Otro</option>
                  </select>
                  <span v-if="fe.category" class="field-error">{{ fe.category }}</span>
                </div>
                <div class="field">
                  <label>Código / SKU</label>
                  <input v-model.trim="form.sku" type="text" placeholder="MED-001" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Precio venta <span class="req">*</span></label>
                  <input v-model.number="form.salePrice" type="number" min="0" step="0.01" placeholder="0.00" :disabled="saving" required />
                  <span v-if="fe.salePrice" class="field-error">{{ fe.salePrice }}</span>
                </div>
                <div class="field">
                  <label>Costo unitario</label>
                  <input v-model.number="form.unitCost" type="number" min="0" step="0.01" placeholder="0.00" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Stock inicial <span class="req">*</span></label>
                  <input v-model.number="form.stock" type="number" min="0" placeholder="0" :disabled="saving" required />
                  <span v-if="fe.stock" class="field-error">{{ fe.stock }}</span>
                </div>
                <div class="field">
                  <label>Stock mínimo</label>
                  <input v-model.number="form.minStock" type="number" min="0" placeholder="5" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Vencimiento (lote inicial)</label>
                  <input v-model="form.expirationDate" type="date" :disabled="saving" />
                </div>
                <div class="field field--full">
                  <label>Descripción</label>
                  <textarea v-model.trim="form.description" rows="2" placeholder="Descripción o indicaciones…" :disabled="saving" />
                </div>
              </div>
            </div>
            <div v-if="saveError" class="alert alert--error mx">{{ saveError }}</div>
            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="closeModal()" :disabled="saving">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <span v-if="saving" class="spin spin--sm" /> <span v-else>Agregar al inventario</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <!-- ======================================================= -->
    <!-- MODAL: PROVEEDOR (nuevo / editar)                       -->
    <!-- ======================================================= -->
    <Transition name="modal">
      <div v-if="showSupplierModal" class="modal-backdrop" @click.self="closeSupplierModal()">
        <div class="modal">
          <div class="modal__header">
            <h3>🚚 {{ editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor' }}</h3>
            <button type="button" class="modal__close" @click="closeSupplierModal()">✕</button>
          </div>
          <form @submit.prevent="handleSupplierSave" novalidate>
            <div class="form-body">
              <div class="form-grid">
                <div class="field field--full">
                  <label>Nombre <span class="req">*</span></label>
                  <input v-model.trim="supplierForm.name" type="text" placeholder="Droguería XYZ" :disabled="supplierSaving" required />
                  <span v-if="sfe.name" class="field-error">{{ sfe.name }}</span>
                </div>
                <div class="field">
                  <label>CUIT / ID fiscal</label>
                  <input v-model.trim="supplierForm.taxId" type="text" placeholder="20-12345678-9" :disabled="supplierSaving" />
                </div>
                <div class="field">
                  <label>Contacto</label>
                  <input v-model.trim="supplierForm.contactName" type="text" placeholder="Juan Pérez" :disabled="supplierSaving" />
                </div>
                <div class="field">
                  <label>Email</label>
                  <input v-model.trim="supplierForm.email" type="email" placeholder="ventas@drogueria.com" :disabled="supplierSaving" />
                </div>
                <div class="field">
                  <label>Teléfono</label>
                  <input v-model.trim="supplierForm.phone" type="text" placeholder="+54 11 1234-5678" :disabled="supplierSaving" />
                </div>
                <div class="field">
                  <label>Plazo de pago (días)</label>
                  <input v-model.number="supplierForm.paymentTerms" type="number" min="0" placeholder="30" :disabled="supplierSaving" />
                </div>
                <div class="field field--full">
                  <label>Dirección</label>
                  <textarea v-model.trim="supplierForm.address" rows="2" placeholder="Av. Corrientes 1234, CABA" :disabled="supplierSaving" />
                </div>
                <div class="field field--full">
                  <label>Notas</label>
                  <textarea v-model.trim="supplierForm.notes" rows="2" placeholder="Observaciones adicionales…" :disabled="supplierSaving" />
                </div>
              </div>
            </div>
            <div v-if="supplierSaveError" class="alert alert--error mx">{{ supplierSaveError }}</div>
            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="closeSupplierModal()" :disabled="supplierSaving">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="supplierSaving">
                <span v-if="supplierSaving" class="spin spin--sm" />
                <span v-else>{{ editingSupplier ? 'Guardar cambios' : 'Crear proveedor' }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <!-- ======================================================= -->
    <!-- MODAL: NUEVA ORDEN DE COMPRA                            -->
    <!-- ======================================================= -->
    <Transition name="modal">
      <div v-if="showOrderModal" class="modal-backdrop" @click.self="closeOrderModal()">
        <div class="modal modal--wide">
          <div class="modal__header">
            <h3>🛒 Nueva orden de compra</h3>
            <button type="button" class="modal__close" @click="closeOrderModal()">✕</button>
          </div>
          <form @submit.prevent="handleOrderCreate" novalidate>
            <div class="form-body">
              <div class="form-grid">
                <div class="field">
                  <label>Proveedor <span class="req">*</span></label>
                  <select v-model="orderForm.supplierId" :disabled="orderSaving" required>
                    <option value="">Seleccioná…</option>
                    <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
                  </select>
                  <span v-if="ofe.supplierId" class="field-error">{{ ofe.supplierId }}</span>
                </div>
                <div class="field">
                  <label>Fecha pedido</label>
                  <input v-model="orderForm.orderedDate" type="date" :disabled="orderSaving" />
                </div>
                <div class="field">
                  <label>Fecha esperada</label>
                  <input v-model="orderForm.expectedDate" type="date" :disabled="orderSaving" />
                </div>
                <div class="field field--full">
                  <label>Notas</label>
                  <textarea v-model.trim="orderForm.notes" rows="2" placeholder="Observaciones…" :disabled="orderSaving" />
                </div>
              </div>

              <!-- Items de la OC -->
              <div class="oc-items-section">
                <div class="oc-items-header">
                  <span class="oc-items-title">Ítems</span>
                  <button type="button" class="btn-sm btn-sm--primary" @click="addOrderItem()">+ Agregar ítem</button>
                </div>
                <span v-if="ofe.items" class="field-error">{{ ofe.items }}</span>

                <div v-if="orderForm.items.length === 0" class="oc-items-empty">Sin ítems. Agregá al menos uno.</div>

                <div v-for="(item, idx) in orderForm.items" :key="idx" class="oc-item-row">
                  <div class="field field--grow">
                    <label>Producto</label>
                    <select v-model="item.itemId" :disabled="orderSaving">
                      <option value="">Seleccioná…</option>
                      <option v-for="p in items" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                  </div>
                  <div class="field field--narrow">
                    <label>Cantidad</label>
                    <input v-model.number="item.quantity" type="number" min="1" placeholder="1" :disabled="orderSaving" />
                  </div>
                  <div class="field field--narrow">
                    <label>Costo unit.</label>
                    <input v-model.number="item.unitCost" type="number" min="0" step="0.01" placeholder="0.00" :disabled="orderSaving" />
                  </div>
                  <button type="button" class="btn-sm btn-sm--danger oc-item-remove" @click="removeOrderItem(idx)" :disabled="orderSaving">✕</button>
                </div>

                <div v-if="orderForm.items.length > 0" class="oc-total">
                  Total estimado: <strong>${{ orderTotal }}</strong>
                </div>
              </div>
            </div>
            <div v-if="orderSaveError" class="alert alert--error mx">{{ orderSaveError }}</div>
            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="closeOrderModal()" :disabled="orderSaving">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="orderSaving">
                <span v-if="orderSaving" class="spin spin--sm" />
                <span v-else>Crear orden de compra</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import http from '../api/client'

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return [value]
}

function normalizeInventoryItem(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    id: row.id ?? row.item_id ?? row.itemId ?? null,
    name: row.name ?? row.item_name ?? row.itemName ?? '',
    sku: row.sku ?? row.code ?? '',
    item_type: row.item_type ?? row.itemType ?? row.type ?? '',
    quantity_available: row.quantity_available ?? row.quantityAvailable ?? row.quantity ?? row.stock ?? 0,
    minimum_stock: row.minimum_stock ?? row.minimumStock ?? row.min_stock ?? 0,
    sale_price: row.sale_price ?? row.salePrice ?? null,
    expiry_date: row.expiry_date ?? row.expiryDate ?? null,
  }
}

function normalizeAlert(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    id: row.id ?? row.alert_id ?? row.alertId ?? null,
    item_name: row.item_name ?? row.itemName ?? row.name ?? '',
    sku: row.sku ?? row.code ?? '',
    alert_type: row.alert_type ?? row.alertType ?? '',
    current_stock: row.current_stock ?? row.currentStock ?? row.stock ?? null,
    threshold: row.threshold ?? row.limit ?? null,
    expiry_date: row.expiry_date ?? row.expiryDate ?? null,
    created_at: row.created_at ?? row.createdAt ?? null,
  }
}

function normalizeSupplier(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    id: row.id ?? row.supplier_id ?? row.supplierId ?? null,
    name: row.name ?? row.company_name ?? row.companyName ?? '',
    tax_id: row.tax_id ?? row.taxId ?? '',
    contact_name: row.contact_name ?? row.contactName ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    payment_terms: row.payment_terms ?? row.paymentTerms ?? 30,
    address: row.address ?? '',
    notes: row.notes ?? '',
  }
}

function normalizeOrder(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    id: row.id ?? row.order_id ?? row.orderId ?? null,
    supplier_id: row.supplier_id ?? row.supplierId ?? null,
    status: row.status ?? '',
    ordered_date: row.ordered_date ?? row.orderedDate ?? null,
    expected_date: row.expected_date ?? row.expectedDate ?? null,
    total: row.total ?? row.amount ?? null,
  }
}

// ---------------------------------------------------------------
// TABS
// ---------------------------------------------------------------
const tabs = [
  { key: 'products',  label: '📦 Productos' },
  { key: 'alerts',    label: '⚠️ Alertas' },
  { key: 'suppliers', label: '🚚 Proveedores' },
  { key: 'orders',    label: '🛒 Órdenes de compra' },
]
const activeTab = ref('products')

function setTab(key) {
  activeTab.value = key
  if (key === 'alerts'    && alerts.value.length === 0    && !alertsLoading.value)    loadAlerts()
  if (key === 'suppliers' && suppliers.value.length === 0 && !suppliersLoading.value) loadSuppliers()
  if (key === 'orders'    && orders.value.length === 0    && !ordersLoading.value)    loadOrders()
}

// ---------------------------------------------------------------
// PRODUCTOS (existing logic)
// ---------------------------------------------------------------
const items      = ref([])
const loading    = ref(false)
const error      = ref('')
const search     = ref('')
const categoryFilter = ref('')
const stockFilter    = ref('')
const pagination = ref({ page: 1, totalPages: 1 })

const lowStock = computed(() => items.value.filter(p => isLow(p)))

function isOut(p) { return (p.quantity_available ?? 0) <= 0 }
function isLow(p) {
  const cur = p.quantity_available ?? 0
  const min = p.minimum_stock ?? 0
  return !isOut(p) && min > 0 && cur <= min
}

function catLabel(c) {
  const m = { medication:'💊 Medicamento', vaccine:'💉 Vacuna', supply:'📦 Insumo', food:'🦴 Alimento', equipment:'🔧 Equipamiento', other:'📦 Otro' }
  return m[c] || c || '—'
}

function catStyle(c) {
  const m = {
    medication: 'background:#EEE0FF;color:#7A3DAA',
    vaccine:    'background:#FDEAEA;color:#c0392b',
    supply:     'background:#FFF3CC;color:#8A6200',
    food:       'background:#FFE8D0;color:#A05028',
    equipment:  'background:#D6EEFF;color:#1A5FAA',
    other:      'background:var(--surface-2);color:var(--text-2)',
  }
  return m[c] || m.other
}

function stockBadge(p) {
  if (isOut(p)) return 'badge--red'
  if (isLow(p)) return 'badge--yellow'
  return 'badge--green'
}

function stockLabel(p) {
  if (isOut(p)) return 'Sin stock'
  if (isLow(p)) return 'Stock bajo'
  return 'Disponible'
}

function expClass(dt) {
  if (!dt) return ''
  const days = (new Date(dt) - Date.now()) / (1000 * 60 * 60 * 24)
  if (days < 0)  return 'overdue'
  if (days < 60) return 'due-soon'
  return ''
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' })
}

async function load(page = 1) {
  loading.value = true; error.value = ''
  try {
    const params = { page, limit: 25 }
    if (search.value)         params.search      = search.value
    if (categoryFilter.value) params.itemType    = categoryFilter.value
    if (stockFilter.value)    params.stockStatus = stockFilter.value
    const { data } = await http.get('/inventory', { params })
    items.value = asArray(data?.data || data?.items || data).map(normalizeInventoryItem).filter(Boolean)
    const m = data.meta || {}
    pagination.value = { page: m.page || page, totalPages: m.totalPages || 1 }
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudo cargar el inventario'
  } finally { loading.value = false }
}

let timer = null
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 350) }

// Modal producto
const showModal = ref(false)
const saving    = ref(false)
const saveError = ref('')
const fe        = reactive({})
const form = reactive({ name:'', category:'', sku:'', salePrice:'', unitCost:'', stock:'', minStock:'', expirationDate:'', description:'' })

function openModal()  { resetForm(); showModal.value = true }
function closeModal() { showModal.value = false; resetForm() }
function resetForm() {
  Object.keys(form).forEach(k => form[k] = '')
  saveError.value = ''; Object.keys(fe).forEach(k => delete fe[k])
}

function validate() {
  Object.keys(fe).forEach(k => delete fe[k])
  if (!form.name)                              fe.name      = 'Requerido'
  if (!form.category)                          fe.category  = 'Requerido'
  if (form.salePrice === '' || form.salePrice === null) fe.salePrice = 'Requerido'
  if (form.stock === '' || form.stock === null) fe.stock     = 'Requerido'
  return Object.keys(fe).length === 0
}

async function handleCreate() {
  if (!validate()) return
  saving.value = true; saveError.value = ''
  try {
    const payload = {
      name:      form.name,
      itemType:  form.category,
      salePrice: parseFloat(form.salePrice),
    }
    if (form.sku)             payload.sku           = form.sku
    if (form.unitCost !== '')  payload.unitCost      = parseFloat(form.unitCost)
    if (form.minStock !== '')  payload.minimumStock  = parseInt(form.minStock)
    if (form.description)     payload.description   = form.description
    const { data: created } = await http.post('/inventory/items', payload)
    if (parseInt(form.stock) > 0 && created?.id) {
      await http.post('/inventory/batches', {
        itemId:           created.id,
        lotNumber:        'INICIAL',
        quantityReceived: parseInt(form.stock),
        expiryDate:       form.expirationDate || undefined,
      })
    }
    closeModal(); await load()
  } catch (e) {
    saveError.value = e.response?.data?.message || 'No se pudo agregar el producto'
  } finally { saving.value = false }
}

// ---------------------------------------------------------------
// ALERTAS
// ---------------------------------------------------------------
const alerts        = ref([])
const alertsLoading = ref(false)
const alertsError   = ref('')
const resolvingAlert = ref(null)

function alertLabel(type) {
  const m = { low_stock: 'Stock bajo', out_of_stock: 'Sin stock', expiring_soon: 'Próximo a vencer', expired: 'Vencido' }
  return m[type] || type
}

function alertBadgeClass(type) {
  const m = {
    low_stock:     'badge--yellow',
    out_of_stock:  'badge--red',
    expiring_soon: 'badge--orange',
    expired:       'badge--darkred',
  }
  return m[type] || 'badge--yellow'
}

async function loadAlerts() {
  alertsLoading.value = true; alertsError.value = ''
  try {
    const { data } = await http.get('/inventory/alerts')
    alerts.value = asArray(data?.data || data?.alerts || data).map(normalizeAlert).filter(Boolean)
  } catch (e) {
    alertsError.value = e.response?.data?.message || 'No se pudieron cargar las alertas'
  } finally { alertsLoading.value = false }
}

async function resolveAlert(id) {
  resolvingAlert.value = id
  try {
    await http.patch(`/inventory/alerts/${id}/resolve`)
    alerts.value = alerts.value.filter(a => String(a.id) !== String(id))
  } catch (e) {
    alertsError.value = e.response?.data?.message || 'No se pudo resolver la alerta'
  } finally { resolvingAlert.value = null }
}

// ---------------------------------------------------------------
// PROVEEDORES
// ---------------------------------------------------------------
const suppliers        = ref([])
const suppliersLoading = ref(false)
const suppliersError   = ref('')
const deletingSupplier = ref(null)

const showSupplierModal  = ref(false)
const supplierSaving     = ref(false)
const supplierSaveError  = ref('')
const editingSupplier    = ref(null)
const sfe                = reactive({})
const supplierForm = reactive({ name:'', taxId:'', contactName:'', email:'', phone:'', address:'', paymentTerms:30, notes:'' })

async function loadSuppliers() {
  suppliersLoading.value = true; suppliersError.value = ''
  try {
    const { data } = await http.get('/suppliers')
    suppliers.value = asArray(data?.data || data?.suppliers || data).map(normalizeSupplier).filter(Boolean)
  } catch (e) {
    suppliersError.value = e.response?.data?.message || 'No se pudieron cargar los proveedores'
  } finally { suppliersLoading.value = false }
}

function supplierName(id) {
  return suppliers.value.find(s => s.id === id)?.name || '—'
}

function supplierNameStable(id) {
  return suppliers.value.find(s => String(s.id) === String(id))?.name || '—'
}

function openSupplierModal(supplier = null) {
  editingSupplier.value = supplier
  Object.keys(sfe).forEach(k => delete sfe[k])
  supplierSaveError.value = ''
  if (supplier) {
    supplierForm.name         = supplier.name         || ''
    supplierForm.taxId        = supplier.tax_id       || ''
    supplierForm.contactName  = supplier.contact_name || ''
    supplierForm.email        = supplier.email        || ''
    supplierForm.phone        = supplier.phone        || ''
    supplierForm.address      = supplier.address      || ''
    supplierForm.paymentTerms = supplier.payment_terms ?? 30
    supplierForm.notes        = supplier.notes        || ''
  } else {
    Object.assign(supplierForm, { name:'', taxId:'', contactName:'', email:'', phone:'', address:'', paymentTerms:30, notes:'' })
  }
  showSupplierModal.value = true
}

function closeSupplierModal() {
  showSupplierModal.value = false
  editingSupplier.value = null
}

function validateSupplier() {
  Object.keys(sfe).forEach(k => delete sfe[k])
  if (!supplierForm.name) sfe.name = 'Requerido'
  return Object.keys(sfe).length === 0
}

async function handleSupplierSave() {
  if (!validateSupplier()) return
  supplierSaving.value = true; supplierSaveError.value = ''
  try {
    const payload = {
      name:         supplierForm.name,
      taxId:        supplierForm.taxId        || undefined,
      contactName:  supplierForm.contactName  || undefined,
      email:        supplierForm.email        || undefined,
      phone:        supplierForm.phone        || undefined,
      address:      supplierForm.address      || undefined,
      paymentTerms: supplierForm.paymentTerms ?? 30,
      notes:        supplierForm.notes        || undefined,
    }
    if (editingSupplier.value) {
      await http.put(`/suppliers/${editingSupplier.value.id}`, payload)
    } else {
      await http.post('/suppliers', payload)
    }
    closeSupplierModal()
    await loadSuppliers()
  } catch (e) {
    supplierSaveError.value = e.response?.data?.message || 'No se pudo guardar el proveedor'
  } finally { supplierSaving.value = false }
}

async function deleteSupplier(id) {
  if (!confirm('¿Eliminar este proveedor?')) return
  deletingSupplier.value = id
  try {
    await http.delete(`/suppliers/${id}`)
    suppliers.value = suppliers.value.filter(s => String(s.id) !== String(id))
  } catch (e) {
    suppliersError.value = e.response?.data?.message || 'No se pudo eliminar el proveedor'
  } finally { deletingSupplier.value = null }
}

// ---------------------------------------------------------------
// ÓRDENES DE COMPRA
// ---------------------------------------------------------------
const orders        = ref([])
const ordersLoading = ref(false)
const ordersError   = ref('')
const actioningOrder = ref(null)

const showOrderModal  = ref(false)
const orderSaving     = ref(false)
const orderSaveError  = ref('')
const ofe             = reactive({})
const orderForm = reactive({
  supplierId:   '',
  orderedDate:  '',
  expectedDate: '',
  notes:        '',
  items:        [],
})

const orderTotal = computed(() => {
  return orderForm.items.reduce((acc, i) => acc + ((i.quantity || 0) * (i.unitCost || 0)), 0).toFixed(2)
})

function orderStatusLabel(s) {
  const m = { draft:'Borrador', sent:'Enviada', partial:'Parcial', received:'Recibida', cancelled:'Cancelada' }
  return m[s] || s
}

function orderStatusClass(s) {
  const m = { draft:'badge--neutral', sent:'badge--blue', partial:'badge--orange', received:'badge--green', cancelled:'badge--red' }
  return m[s] || 'badge--neutral'
}

async function loadOrders() {
  ordersLoading.value = true; ordersError.value = ''
  try {
    const { data } = await http.get('/purchase-orders')
    orders.value = asArray(data?.data || data?.orders || data).map(normalizeOrder).filter(Boolean)
  } catch (e) {
    ordersError.value = e.response?.data?.message || 'No se pudieron cargar las órdenes de compra'
  } finally { ordersLoading.value = false }
}

function openOrderModal() {
  Object.keys(ofe).forEach(k => delete ofe[k])
  orderSaveError.value = ''
  Object.assign(orderForm, { supplierId:'', orderedDate:'', expectedDate:'', notes:'', items:[] })
  // Ensure items list is populated for the selector
  if (items.value.length === 0) load()
  if (suppliers.value.length === 0) loadSuppliers()
  showOrderModal.value = true
}

function closeOrderModal() { showOrderModal.value = false }

function addOrderItem() {
  orderForm.items.push({ itemId:'', quantity:1, unitCost:'' })
}

function removeOrderItem(idx) {
  orderForm.items.splice(idx, 1)
}

function validateOrder() {
  Object.keys(ofe).forEach(k => delete ofe[k])
  if (!orderForm.supplierId) ofe.supplierId = 'Requerido'
  if (orderForm.items.length === 0) ofe.items = 'Agregá al menos un ítem'
  return Object.keys(ofe).length === 0
}

async function handleOrderCreate() {
  if (!validateOrder()) return
  orderSaving.value = true; orderSaveError.value = ''
  try {
    const payload = {
      supplierId:   orderForm.supplierId,
      orderedDate:  orderForm.orderedDate  || undefined,
      expectedDate: orderForm.expectedDate || undefined,
      notes:        orderForm.notes        || undefined,
      items: orderForm.items.map(i => ({
        itemId:   i.itemId,
        quantity: i.quantity,
        unitCost: i.unitCost !== '' ? parseFloat(i.unitCost) : undefined,
      })),
    }
    await http.post('/purchase-orders', payload)
    closeOrderModal()
    await loadOrders()
  } catch (e) {
    orderSaveError.value = e.response?.data?.message || 'No se pudo crear la orden de compra'
  } finally { orderSaving.value = false }
}

async function sendOrder(id) {
  actioningOrder.value = id
  try {
    await http.patch(`/purchase-orders/${id}/send`)
    await loadOrders()
  } catch (e) {
    ordersError.value = e.response?.data?.message || 'No se pudo enviar la orden'
  } finally { actioningOrder.value = null }
}

async function cancelOrder(id) {
  if (!confirm('¿Cancelar esta orden de compra?')) return
  actioningOrder.value = id
  try {
    await http.patch(`/purchase-orders/${id}/cancel`)
    await loadOrders()
  } catch (e) {
    ordersError.value = e.response?.data?.message || 'No se pudo cancelar la orden'
  } finally { actioningOrder.value = null }
}

// ---------------------------------------------------------------
// INIT
// ---------------------------------------------------------------
onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.page-header__left { display: flex; align-items: center; gap: 14px; }
.page-emoji { font-size: 2rem; }
.page-title { font-size: 1.35rem; font-weight: 700; color: var(--text); }
.page-sub   { font-size: 0.82rem; color: var(--text-2); margin-top: 2px; }

/* ---- Tab nav ---- */
.tab-nav { display: flex; gap: 4px; border-bottom: 2px solid var(--border); flex-wrap: wrap; }
.tab-btn {
  position: relative;
  padding: 10px 18px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text-2);
  cursor: pointer;
  transition: color var(--transition), border-color var(--transition);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tab-btn:hover { color: var(--primary); }
.tab-btn--active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 700; }
.tab-badge {
  background: var(--danger);
  color: white;
  font-size: 0.68rem;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 6px;
  line-height: 1.5;
}

.stock-alert { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #FFF3CC; border-radius: var(--radius); border-left: 3px solid var(--warning); font-size: 0.88rem; color: #8A6200; }

.filters { display: flex; gap: 10px; flex-wrap: wrap; }
.filter-input, .filter-select { padding: 9px 13px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.87rem; background: var(--white); color: var(--text); outline: none; }
.filter-input:focus, .filter-select:focus { border-color: var(--primary); }
.filter-input--grow { flex: 1; min-width: 180px; }

.card { background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow); overflow: hidden; }
.table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.table th { text-align: left; padding: 12px 14px; font-size: 0.78rem; font-weight: 600; color: var(--text-3); letter-spacing: 0.05em; text-transform: uppercase; background: var(--surface); border-bottom: 1px solid var(--border); }
.table td { padding: 12px 14px; border-bottom: 1px solid #f0f0f0; color: var(--text); vertical-align: middle; }
.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: var(--surface); }
.row--low td { background: #FFFDE7; }
.row--out td { background: #FFF5F5; }

.sub { display: block; font-size: 0.75rem; color: var(--text-3); }
.cat-badge { display: inline-block; padding: 3px 9px; border-radius: 6px; font-size: 0.72rem; font-weight: 600; }
.text-warn   { color: #d68910; }
.text-danger { color: #c0392b; }
.overdue  { color: #c0392b; font-weight: 600; }
.due-soon { color: #d68910; font-weight: 600; }

.badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; }
.badge--green   { background: #D6F3EC; color: #1A9E7F; }
.badge--yellow  { background: #FFF3CC; color: #8A6200; }
.badge--red     { background: #FDEAEA; color: #c0392b; }
.badge--orange  { background: #FFF0E0; color: #C05000; }
.badge--darkred { background: #F5D5D5; color: #7A0000; }
.badge--blue    { background: #D6EEFF; color: #1A5FAA; }
.badge--neutral { background: var(--surface-2); color: var(--text-2); }

.action-btns { display: flex; gap: 6px; align-items: center; }

.btn-sm {
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: opacity var(--transition), background var(--transition);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm--ghost   { background: none; border-color: var(--border); color: var(--text-2); }
.btn-sm--ghost:hover:not(:disabled) { background: var(--surface-2); }
.btn-sm--primary { background: var(--primary); color: white; border-color: var(--primary); }
.btn-sm--primary:hover:not(:disabled) { opacity: 0.85; }
.btn-sm--danger  { background: #FDEAEA; color: #c0392b; border-color: #f5c6c6; }
.btn-sm--danger:hover:not(:disabled)  { background: #f5c6c6; }
.btn-sm--icon    { background: none; border-color: var(--border); color: var(--text-2); font-size: 0.85rem; }
.btn-sm--icon:hover { background: var(--surface-2); }

.pagination { display: flex; align-items: center; justify-content: center; gap: 16px; font-size: 0.85rem; color: var(--text-2); }
.pagination button { padding: 6px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: none; cursor: pointer; font-size: 0.82rem; color: var(--text-2); }
.pagination button:hover:not(:disabled) { background: var(--surface-2); }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%); color: white; border: none; border-radius: var(--radius); font-size: 0.9rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: opacity var(--transition), transform var(--transition); }
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost { padding: 10px 20px; background: none; border: 1.5px solid var(--border); border-radius: var(--radius); color: var(--text-2); font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: background var(--transition); }
.btn-ghost:hover:not(:disabled) { background: var(--surface-2); }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto; }
.modal--wide { max-width: 720px; }
.modal__header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--border); }
.modal__header h3 { font-size: 1.1rem; font-weight: 700; color: var(--text); }
.modal__close { background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--text-3); padding: 4px 8px; border-radius: var(--radius-sm); }
.modal__close:hover { background: var(--surface-2); }
.form-body { padding: 20px 24px 0; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field label { font-size: 0.82rem; font-weight: 600; color: var(--text-2); }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.9rem; color: var(--text); background: var(--surface); outline: none; transition: border-color var(--transition); }
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--primary); }
.field textarea { resize: vertical; }
.field--full { grid-column: 1 / -1; }
.field--grow { flex: 1; }
.field--narrow { width: 110px; flex-shrink: 0; }
.field-error { font-size: 0.75rem; color: var(--danger); }
.req { color: var(--danger); }
.modal__actions { display: flex; gap: 12px; justify-content: flex-end; padding: 16px 24px 24px; }
.alert { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 0.875rem; }
.alert--error { background: #FDEAEA; color: #c0392b; border-left: 3px solid var(--danger); }
.mx { margin: 0 24px 8px; }
.loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-3); font-size: 0.9rem; background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); }
.empty-state__emoji { font-size: 3rem; }
.spin { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
.spin--sm { width: 14px; height: 14px; }
.spin--dark { border-color: rgba(0,0,0,0.1); border-top-color: var(--primary); }
@keyframes spin { to { transform: rotate(360deg); } }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

/* OC items */
.oc-items-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; }
.oc-items-header { display: flex; align-items: center; justify-content: space-between; }
.oc-items-title { font-size: 0.85rem; font-weight: 700; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; }
.oc-items-empty { font-size: 0.83rem; color: var(--text-3); padding: 10px 0; }
.oc-item-row { display: flex; align-items: flex-end; gap: 10px; }
.oc-item-remove { align-self: flex-end; margin-bottom: 0; }
.oc-total { text-align: right; font-size: 0.88rem; color: var(--text-2); padding-top: 6px; }

@media (max-width: 600px) {
  .form-grid { grid-template-columns: 1fr; }
  .table th:nth-child(5), .table td:nth-child(5) { display: none; }
  .oc-item-row { flex-wrap: wrap; }
  .field--narrow { width: 100%; }
}
</style>
