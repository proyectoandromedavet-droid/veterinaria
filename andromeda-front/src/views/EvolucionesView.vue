<template>
  <div class="page">

    <div class="page-header">
      <div class="page-header__left">
        <span class="page-emoji">📋</span>
        <div>
          <h2 class="page-title">{{ t('evolutions.title') }}</h2>
          <p class="page-sub">{{ t('evolutions.subtitle') }}</p>
        </div>
      </div>
      <button type="button" class="btn-primary" @click="openModal()">✏️ {{ t('evolutions.newEvolution') }}</button>
    </div>

    <div class="filters">
      <input v-model.trim="search" type="search" :placeholder="t('evolutions.searchPlaceholder')" class="filter-input filter-input--grow" @input="debouncedLoad()" />
      <input v-model="dateFrom" type="date" class="filter-input" @change="load()" />
      <input v-model="dateTo"   type="date" class="filter-input" @change="load()" />
    </div>

    <div v-if="loading" class="loading-state">
      <span class="spin spin--dark" /> {{ t('evolutions.loading') }}
    </div>
    <div v-else-if="error" class="alert alert--error">{{ error }}</div>

    <div v-else-if="items.length === 0" class="empty-state">
      <span class="empty-state__emoji">🐱</span>
      <p>{{ t('evolutions.empty') }}</p>
    </div>

    <div v-else class="evol-list">
      <div v-for="ev in items" :key="ev.id" class="evol-card">
        <div class="evol-card__aside">
          <span class="evol-card__emoji">{{ petEmoji(ev.species) }}</span>
          <div class="evol-card__meta">
            <strong>{{ ev.patient_name || '—' }}</strong>
            <span>{{ formatDate(ev.visit_date || ev.opened_at) }}</span>
          </div>
        </div>
        <div class="evol-card__body">
          <div class="evol-card__section" v-if="ev.chief_complaint">
            <span class="evol-tag evol-tag--blue">{{ t('evolutions.chiefComplaint') }}</span>
            <p>{{ ev.chief_complaint }}</p>
          </div>
          <div class="evol-card__vitals" v-if="ev.weight_kg || ev.temperature_celsius">
            <span v-if="ev.weight_kg" class="vital-chip">⚖️ {{ ev.weight_kg }} kg</span>
            <span v-if="ev.temperature_celsius" class="vital-chip">🌡️ {{ ev.temperature_celsius }}°C</span>
          </div>
        </div>
        <div class="evol-card__vet" v-if="ev.vet_name">
          <span>👨‍⚕️ {{ ev.vet_name }}</span>
          <span class="evol-status" :class="`status--${ev.status}`">{{ statusLabel(ev.status) }}</span>
        </div>
        <div class="appt-card__actions">
          <button type="button" class="btn-xs btn-xs--blue" @click="openDetail(ev)">Ver detalle</button>
        </div>
      </div>
    </div>

    <div v-if="pagination.totalPages > 1" class="pagination">
      <button type="button" :disabled="pagination.page <= 1" @click="load(pagination.page - 1)">← Ant.</button>
      <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button :disabled="pagination.page >= pagination.totalPages" @click="load(pagination.page + 1)">Sig. →</button>
    </div>

    <Transition name="modal">
      <div v-if="showDetail" class="modal-backdrop" @click.self="closeDetail()">
        <div class="modal modal--wide">
          <div class="modal__header">
            <h3>📋 Detalle evolución</h3>
            <button type="button" class="modal__close" @click="closeDetail()">✕</button>
          </div>
          <div v-if="detailLoading" class="loading-state">
            <span class="spin spin--dark" /> {{ t('evolutions.loading') }}
          </div>
          <div v-else-if="detailError" class="alert alert--error">{{ detailError }}</div>
          <div v-else-if="detailRecord" class="form-body">
            <div class="detail-row"><b>Paciente:</b> {{ detailRecord.patient_name || '—' }}</div>
            <div class="detail-row"><b>Especie:</b> {{ detailRecord.species || '—' }}</div>
            <div class="detail-row"><b>Veterinario:</b> {{ detailRecord.vet_name || '—' }}</div>
            <div class="detail-row"><b>Motivo principal:</b> {{ detailRecord.chief_complaint || '—' }}</div>
            <div class="detail-row"><b>Fecha visita:</b> {{ formatDate(detailRecord.visit_date || detailRecord.opened_at) }}</div>
            <div class="detail-row"><b>Estado:</b> {{ statusLabel(detailRecord.status) }}</div>
            <div class="detail-row"><b>Firmada:</b> {{ detailRecord.signed_at ? formatDate(detailRecord.signed_at) : '—' }}</div>
            <div class="detail-row"><b>Peso:</b> {{ detailRecord.weight_kg ? detailRecord.weight_kg + ' kg' : '—' }}</div>
            <div class="detail-row"><b>Temperatura:</b> {{ detailRecord.temperature_celsius ? detailRecord.temperature_celsius + '°C' : '—' }}</div>
            <div class="detail-row" v-if="detailRecord.notes"><b>Notas:</b> {{ detailRecord.notes }}</div>

            <div v-if="detailRecord.anamnesisText" class="detail-block">
              <b>Anamnesis</b>
              <pre class="detail-pre">{{ detailRecord.anamnesisText }}</pre>
            </div>

            <div v-if="detailRecord.physicalExamText" class="detail-block">
              <b>Examen físico</b>
              <pre class="detail-pre">{{ detailRecord.physicalExamText }}</pre>
            </div>

            <div v-if="detailRecord.diagnoses?.length" class="detail-block">
              <b>Diagnósticos</b>
              <ul class="detail-list">
                <li v-for="diag in detailRecord.diagnoses" :key="diag.id || diag.diagnosis_name">
                  {{ diag.diagnosis_name || diag.name || '—' }}
                  <span class="sub">{{ [diag.diagnosis_type, diag.diagnosis_code, diag.prognosis].filter(Boolean).join(' · ') || 'sin detalle' }}</span>
                </li>
              </ul>
            </div>

            <div v-if="detailRecord.treatments?.length" class="detail-block">
              <b>Tratamientos</b>
              <ul class="detail-list">
                <li v-for="tx in detailRecord.treatments" :key="tx.id || tx.treatment_name">
                  {{ tx.treatment_name || tx.name || '—' }}
                  <span class="sub">{{ [tx.route, tx.frequency, tx.duration_days ? tx.duration_days + ' días' : ''].filter(Boolean).join(' · ') || 'sin detalle' }}</span>
                </li>
              </ul>
            </div>

            <div v-if="detailRecord.prescriptions?.length" class="detail-block">
              <b>Recetas</b>
              <ul class="detail-list">
                <li v-for="rx in detailRecord.prescriptions" :key="rx.id || rx.medication_name">
                  {{ rx.medication_name || '—' }}
                  <span class="sub">{{ [rx.dose, rx.frequency, rx.route].filter(Boolean).join(' · ') || 'sin detalle' }}</span>
                </li>
              </ul>
            </div>

            <div class="detail-block">
              <b>Órdenes derivadas</b>
              <div v-if="relatedOrdersLoading" class="loading-state" style="padding:20px 0">
                <span class="spin spin--dark" /> Cargando órdenes vinculadas…
              </div>
              <div v-else class="detail-related-grid">
                <div class="detail-related-card">
                  <strong>Laboratorio</strong>
                  <ul v-if="relatedOrders.lab.length" class="detail-list">
                    <li v-for="order in relatedOrders.lab" :key="`lab-${order.id}`">
                      {{ order.order_number || ('#' + order.id) }}
                      <span class="sub">{{ [order.status, order.priority, order.test_count ? order.test_count + ' pruebas' : '', order.ordered_at ? formatDate(order.ordered_at) : ''].filter(Boolean).join(' · ') }}</span>
                    </li>
                  </ul>
                  <span v-else class="sub">Sin órdenes de laboratorio vinculadas.</span>
                </div>
                <div class="detail-related-card">
                  <strong>Imágenes</strong>
                  <ul v-if="relatedOrders.imaging.length" class="detail-list">
                    <li v-for="order in relatedOrders.imaging" :key="`img-${order.id}`">
                      {{ order.order_number || ('#' + order.id) }}
                      <span class="sub">{{ [order.imaging_type, order.status, order.body_region, order.ordered_at ? formatDate(order.ordered_at) : ''].filter(Boolean).join(' · ') }}</span>
                    </li>
                  </ul>
                  <span v-else class="sub">Sin órdenes de imágenes vinculadas.</span>
                </div>
                <div class="detail-related-card">
                  <strong>Internación</strong>
                  <ul v-if="relatedOrders.hospitalizations.length" class="detail-list">
                    <li v-for="item in relatedOrders.hospitalizations" :key="`hos-${item.id}`">
                      Internación #{{ item.id }}
                      <span class="sub">{{ [item.hospitalization_status, item.ward_name, item.kennel_number ? 'Jaula ' + item.kennel_number : '', item.admission_date ? formatDate(item.admission_date) : ''].filter(Boolean).join(' · ') }}</span>
                    </li>
                  </ul>
                  <span v-else class="sub">Sin internaciones vinculadas.</span>
                </div>
                <div class="detail-related-card">
                  <strong>Cirugía</strong>
                  <ul v-if="relatedOrders.surgeries.length" class="detail-list">
                    <li v-for="item in relatedOrders.surgeries" :key="`sur-${item.id}`">
                      {{ item.surgery_type || ('Cirugía #' + item.id) }}
                      <span class="sub">{{ [item.status, item.lead_surgeon, item.scheduled_date ? formatDate(item.scheduled_date) : ''].filter(Boolean).join(' · ') }}</span>
                    </li>
                  </ul>
                  <span v-else class="sub">Sin cirugías vinculadas.</span>
                </div>
              </div>
            </div>

            <div class="detail-block">
              <b>Acciones clínicas</b>
              <div v-if="orderCatalogError" class="alert alert--error" style="margin-top:12px; margin-bottom:12px">{{ orderCatalogError }}</div>
              <div class="detail-actions-grid">
                <div class="detail-action-card">
                  <strong>Laboratorio</strong>
                  <div class="form-grid">
                    <div class="field">
                      <label>Prioridad</label>
                      <select v-model="detailOrders.lab.priority" :disabled="detailActionSaving">
                        <option value="routine">Rutina</option>
                        <option value="urgent">Urgente</option>
                        <option value="emergency">Emergencia</option>
                      </select>
                    </div>
                    <div class="field field--full">
                      <label>Notas clínicas</label>
                      <textarea v-model.trim="detailOrders.lab.clinicalNotes" rows="2" :disabled="detailActionSaving" />
                    </div>
                  </div>
                  <div v-if="loadingLabTests" class="loading-state" style="padding:12px 0">
                    <span class="spin spin--dark" /> Cargando pruebas…
                  </div>
                  <div v-else class="tests-catalog">
                    <div v-for="(tests, category) in groupedLabTests" :key="category" class="test-category">
                      <div class="test-category__title">{{ category }}</div>
                      <div class="test-category__items">
                        <label v-for="test in tests" :key="test.id" class="test-checkbox-label">
                          <input v-model="detailOrders.lab.tests" type="checkbox" :value="test.id" :disabled="detailActionSaving" />
                          <div class="test-info">
                            <strong>{{ test.name }}</strong>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                  <button type="button" class="btn-primary btn-sm" :disabled="detailActionSaving || !detailOrders.lab.tests.length" @click="submitDetailLabOrder()">Crear orden de laboratorio</button>
                </div>

                <div class="detail-action-card">
                  <strong>Imágenes</strong>
                  <div class="form-grid">
                    <div class="field">
                      <label>Tipo de estudio</label>
                      <select v-model="detailOrders.imaging.imagingTypeId" :disabled="detailActionSaving || loadingImagingTypes">
                        <option value="">{{ loadingImagingTypes ? 'Cargando tipos…' : 'Seleccionar estudio' }}</option>
                        <option v-for="type in imagingTypes" :key="type.id" :value="type.id">{{ type.name }}{{ type.modality ? ' · ' + type.modality : '' }}</option>
                      </select>
                    </div>
                    <div class="field">
                      <label>Prioridad</label>
                      <select v-model="detailOrders.imaging.priority" :disabled="detailActionSaving">
                        <option value="routine">Rutina</option>
                        <option value="urgent">Urgente</option>
                        <option value="emergency">Emergencia</option>
                      </select>
                    </div>
                    <div class="field">
                      <label>Región anatómica</label>
                      <input v-model.trim="detailOrders.imaging.bodyRegion" type="text" :disabled="detailActionSaving" />
                    </div>
                    <label class="checkbox-label">
                      <input v-model="detailOrders.imaging.sedationRequired" type="checkbox" :disabled="detailActionSaving" />
                      Requiere sedación
                    </label>
                    <div class="field field--full">
                      <label>Indicación clínica</label>
                      <textarea v-model.trim="detailOrders.imaging.clinicalIndication" rows="2" :disabled="detailActionSaving" />
                    </div>
                  </div>
                  <button type="button" class="btn-primary btn-sm" :disabled="detailActionSaving || !detailOrders.imaging.imagingTypeId" @click="submitDetailImagingOrder()">Crear orden de imágenes</button>
                </div>

                <div class="detail-action-card">
                  <strong>Internación</strong>
                  <div class="form-grid">
                    <div class="field">
                      <label>Veterinario responsable</label>
                      <select v-model="detailOrders.hospitalization.responsibleVetId" :disabled="detailActionSaving || loadingProfessionals">
                        <option value="">{{ loadingProfessionals ? 'Cargando profesionales…' : 'Seleccionar veterinario' }}</option>
                        <option v-for="professional in hospitalizationProfessionals" :key="professional.id" :value="String(professional.id)">{{ professional.label }}</option>
                      </select>
                    </div>
                    <div class="field">
                      <label>Sala</label>
                      <select v-model="detailOrders.hospitalization.wardId" :disabled="detailActionSaving || wardsLoading" @change="detailOrders.hospitalization.kennelId = ''">
                        <option value="">{{ wardsLoading ? 'Cargando salas…' : 'Seleccionar sala' }}</option>
                        <option v-for="ward in availableWards" :key="ward.id" :value="ward.id">{{ ward.name }}{{ ward.available_kennels != null ? ' (' + ward.available_kennels + ' libres)' : '' }}</option>
                      </select>
                    </div>
                    <div class="field">
                      <label>Jaula</label>
                      <select v-model="detailOrders.hospitalization.kennelId" :disabled="detailActionSaving || !detailOrders.hospitalization.wardId">
                        <option value="">Sin jaula asignada</option>
                        <option v-for="kennel in freeKennelsForDetailWard" :key="kennel.id" :value="kennel.id">Jaula {{ kennel.number }}{{ kennel.kennel_type ? ' (' + kennel.kennel_type + ')' : '' }}</option>
                      </select>
                    </div>
                    <div class="field">
                      <label>Peso ingreso</label>
                      <input v-model.number="detailOrders.hospitalization.admissionWeight" type="number" min="0" step="0.01" :disabled="detailActionSaving" />
                    </div>
                    <div class="field">
                      <label>Alta estimada</label>
                      <input v-model="detailOrders.hospitalization.estimatedDischargeDate" type="date" :disabled="detailActionSaving" />
                    </div>
                    <div class="field field--full">
                      <label>Motivo de internación</label>
                      <textarea v-model.trim="detailOrders.hospitalization.hospitalizationReason" rows="2" :disabled="detailActionSaving" />
                    </div>
                    <div class="field field--full">
                      <label>Diagnóstico de ingreso</label>
                      <textarea v-model.trim="detailOrders.hospitalization.admissionDiagnosis" rows="2" :disabled="detailActionSaving" />
                    </div>
                    <div class="field field--full">
                      <label>Indicaciones especiales</label>
                      <textarea v-model.trim="detailOrders.hospitalization.specialInstructions" rows="2" :disabled="detailActionSaving" />
                    </div>
                  </div>
                  <button type="button" class="btn-primary btn-sm" :disabled="detailActionSaving || !detailOrders.hospitalization.hospitalizationReason || !detailOrders.hospitalization.responsibleVetId" @click="submitDetailHospitalization()">Crear internación</button>
                </div>

                <div class="detail-action-card">
                  <strong>Cirugía</strong>
                  <div class="form-grid">
                    <div class="field">
                      <label>Tipo de cirugía</label>
                      <select v-model="detailOrders.surgery.surgeryTypeId" :disabled="detailActionSaving || loadingSurgeryTypes">
                        <option value="">{{ loadingSurgeryTypes ? 'Cargando tipos…' : 'Seleccionar cirugía' }}</option>
                        <optgroup v-for="(types, category) in groupedSurgeryTypes" :key="category" :label="category">
                          <option v-for="type in types" :key="type.id" :value="type.id">{{ type.name }}{{ type.estimated_duration_minutes ? ' · ' + type.estimated_duration_minutes + ' min est.' : '' }}</option>
                        </optgroup>
                      </select>
                    </div>
                    <div class="field">
                      <label>Cirujano responsable</label>
                      <select v-model="detailOrders.surgery.leadSurgeonId" :disabled="detailActionSaving || loadingProfessionals">
                        <option value="">{{ loadingProfessionals ? 'Cargando profesionales…' : 'Seleccionar cirujano' }}</option>
                        <option v-for="professional in surgeryProfessionals" :key="professional.id" :value="String(professional.id)">{{ professional.label }}</option>
                      </select>
                    </div>
                    <div class="field">
                      <label>Fecha programada</label>
                      <input v-model="detailOrders.surgery.scheduledDate" type="date" :disabled="detailActionSaving" />
                    </div>
                    <div class="field">
                      <label>Hora estimada</label>
                      <input v-model="detailOrders.surgery.startTime" type="time" :disabled="detailActionSaving" />
                    </div>
                    <div class="field">
                      <label>Urgencia</label>
                      <select v-model="detailOrders.surgery.urgency" :disabled="detailActionSaving">
                        <option value="elective">Electiva</option>
                        <option value="urgent">Urgente</option>
                        <option value="emergency">Emergencia</option>
                      </select>
                    </div>
                    <div class="field field--full">
                      <label>Diagnóstico preoperatorio</label>
                      <textarea v-model.trim="detailOrders.surgery.preoperativeDiagnosis" rows="2" :disabled="detailActionSaving" />
                    </div>
                    <div class="field field--full">
                      <label>Abordaje quirúrgico</label>
                      <input v-model.trim="detailOrders.surgery.surgicalApproach" type="text" :disabled="detailActionSaving" />
                    </div>
                    <div class="field field--full">
                      <label>Notas quirúrgicas</label>
                      <textarea v-model.trim="detailOrders.surgery.notes" rows="2" :disabled="detailActionSaving" />
                    </div>
                  </div>
                  <button type="button" class="btn-primary btn-sm" :disabled="detailActionSaving || !detailOrders.surgery.surgeryTypeId || !detailOrders.surgery.leadSurgeonId || !detailOrders.surgery.scheduledDate" @click="submitDetailSurgery()">Crear cirugía</button>
                </div>
              </div>

              <div v-if="detailActionError" class="alert alert--error" style="margin-top:12px">{{ detailActionError }}</div>
              <div v-if="detailActionSuccess" class="alert alert--success" style="margin-top:12px">{{ detailActionSuccess }}</div>
            </div>
          </div>
          <div class="modal__actions">
            <button type="button" class="btn-ghost" @click="closeDetail()">Cerrar</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Modal nueva evolución -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal()">
        <div class="modal">
          <div class="modal__header">
            <h3>📋 {{ t('evolutions.newModalTitle') }}</h3>
            <button type="button" class="modal__close" @click="closeModal()">✕</button>
          </div>

          <!-- Tabs -->
          <div class="tabs">
            <button v-for="(t, i) in tabs" :key="i" class="tab-btn" :class="{ 'tab-btn--active': activeTab === i }" @click="activeTab = i" type="button">
              {{ t.icon }} {{ t.label }}
            </button>
          </div>

          <form @submit.prevent="handleCreate" novalidate>
            <div class="form-body">
              <div v-if="orderCatalogError" class="alert alert--error" style="margin-bottom:12px">{{ orderCatalogError }}</div>

              <!-- TAB 0: General + Signos vitales -->
              <div v-show="activeTab === 0">
                <div class="section-title">{{ t('evolutions.generalData') }}</div>
                <div class="form-grid">
                  <div class="field field--full" style="position:relative">
                    <label>{{ t('evolutions.patientLabel') }} <span class="req">*</span></label>
                    <input v-model.trim="patientSearch" type="search" :placeholder="t('evolutions.patientSearchPlaceholder')" :disabled="saving" @input="searchPatients" autocomplete="off" />
                    <div v-if="patientResults.length" class="autocomplete" role="listbox" :aria-label="t('common.searchResults')">
                      <button v-for="pt in patientResults" :key="pt.id" type="button" class="autocomplete__item" role="option" :aria-label="t('common.selectPatient')" @click="selectPatient(pt)">
                        {{ petEmoji(pt.species) }} <b>{{ pt.name }}</b>
                        <span v-if="pt.hc_number" class="autocomplete__owner"> · HC {{ pt.hc_number }}</span>
                        <span class="autocomplete__owner">— {{ pt.primary_owner || '' }}</span>
                      </button>
                    </div>
                    <div v-if="form.patientId" class="selected-patient">✅ {{ selectedPatientLabel }}</div>
                    <span v-if="fe.patientId" class="field-error">{{ fe.patientId }}</span>
                  </div>

                  <div class="field field--full">
                    <label>{{ t('evolutions.chiefComplaint') }} <span class="req">*</span></label>
                    <textarea v-model.trim="form.chiefComplaint" rows="2" :placeholder="t('evolutions.chiefComplaint')" :disabled="saving" />
                    <span v-if="fe.chiefComplaint" class="field-error">{{ fe.chiefComplaint }}</span>
                  </div>

                  <div class="field field--full">
                    <label>{{ t('evolutions.reasonForVisit') }}</label>
                    <input v-model.trim="form.reasonForVisit" type="text" :placeholder="t('evolutions.reasonForVisit')" :disabled="saving" />
                  </div>

                  <div class="field">
                    <label>{{ t('evolutions.visitDate') }}</label>
                    <input v-model="form.visitDate" type="date" :disabled="saving" />
                  </div>

                  <div class="field field--full">
                    <label>{{ t('evolutions.notes') }}</label>
                    <textarea v-model.trim="form.notes" rows="2" :placeholder="t('evolutions.notes')" :disabled="saving" />
                  </div>
                </div>

                <div class="section-title" style="margin-top:18px">{{ t('evolutions.vitalSigns') }}</div>
                <div class="form-grid">
                  <div class="field">
                    <label>{{ t('evolutions.weight') }}</label>
                    <input v-model.number="form.weightKg" type="number" step="0.01" min="0" placeholder="4.20" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.temperature') }}</label>
                    <input v-model.number="form.temperatureCelsius" type="number" step="0.1" placeholder="38.5" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.heartRate') }}</label>
                    <input v-model.number="form.heartRate" type="number" min="0" placeholder="80" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.respiratoryRate') }}</label>
                    <input v-model.number="form.respiratoryRate" type="number" min="0" placeholder="20" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.systolicBp') }}</label>
                    <input v-model.number="form.systolicBp" type="number" min="0" placeholder="120" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.diastolicBp') }}</label>
                    <input v-model.number="form.diastolicBp" type="number" min="0" placeholder="80" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.spo2') }}</label>
                    <input v-model.number="form.spo2Percent" type="number" min="0" max="100" step="0.1" placeholder="98.0" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.bodyConditionScore') }}</label>
                    <input v-model.number="form.bodyConditionScore" type="number" min="1" max="9" step="0.5" placeholder="5" :disabled="saving" />
                  </div>
                </div>
              </div>

              <!-- TAB 1: Anamnesis -->
              <div v-show="activeTab === 1">
                <div class="section-title">{{ t('evolutions.history') }}</div>
                <div class="form-grid">
                  <div class="field field--full">
                    <label>{{ t('evolutions.history') }}</label>
                    <textarea v-model.trim="form.currentIllnessHistory" rows="3" :placeholder="t('evolutions.history')" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.duration') }}</label>
                    <input v-model.trim="form.illnessDuration" type="text" placeholder="Ej: 3 días, 2 semanas" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.onset') }}</label>
                    <input v-model.trim="form.illnessOnset" type="text" placeholder="Ej: brusco, progresivo, intermitente" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.appetite') }}</label>
                    <select v-model="form.appetite" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="normal">Normal</option>
                      <option value="increased">Aumentado (polifagia)</option>
                      <option value="decreased">Disminuido (hiporexia)</option>
                      <option value="absent">Ausente (anorexia)</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.thirst') }}</label>
                    <select v-model="form.thirst" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="normal">Normal</option>
                      <option value="increased">Aumentada (polidipsia)</option>
                      <option value="decreased">Disminuida</option>
                      <option value="absent">Ausente</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.urination') }}</label>
                    <select v-model="form.urination" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="normal">Normal</option>
                      <option value="increased">Aumentada (poliuria)</option>
                      <option value="decreased">Disminuida (oliguria)</option>
                      <option value="absent">Ausente (anuria)</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.defecation') }}</label>
                    <select v-model="form.defecation" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="normal">Normal</option>
                      <option value="increased">Aumentada</option>
                      <option value="decreased">Disminuida</option>
                      <option value="absent">Ausente</option>
                      <option value="diarrhea">Diarrea</option>
                      <option value="constipation">Constipación</option>
                    </select>
                  </div>
                </div>

                <div class="section-title" style="margin-top:16px">{{ t('evolutions.symptoms') }}</div>
                <div class="checkbox-grid">
                  <label class="checkbox-label"><input type="checkbox" v-model="form.vomiting" :disabled="saving" /> {{ t('evolutions.vomiting') }}</label>
                  <label class="checkbox-label"><input type="checkbox" v-model="form.coughing" :disabled="saving" /> {{ t('evolutions.coughing') }}</label>
                  <label class="checkbox-label"><input type="checkbox" v-model="form.sneezing" :disabled="saving" /> {{ t('evolutions.sneezing') }}</label>
                  <label class="checkbox-label"><input type="checkbox" v-model="form.pruritus" :disabled="saving" /> {{ t('evolutions.pruritus') }}</label>
                  <label class="checkbox-label"><input type="checkbox" v-model="form.locomotionIssues" :disabled="saving" /> {{ t('evolutions.locomotionIssues') }}</label>
                  <label class="checkbox-label"><input type="checkbox" v-model="form.contactWithAnimals" :disabled="saving" /> {{ t('evolutions.contactWithAnimals') }}</label>
                </div>
                <div class="form-grid" style="margin-top:10px">
                  <div class="field field--full">
                    <label>{{ t('evolutions.otherSigns') }}</label>
                    <textarea v-model.trim="form.otherSigns" rows="2" :placeholder="t('evolutions.otherSigns')" :disabled="saving" />
                  </div>
                </div>

                <div class="section-title" style="margin-top:16px">Antecedentes</div>
                <div class="form-grid">
                  <div class="field">
                    <label>{{ t('evolutions.feedingType') }}</label>
                    <select v-model="form.feedingType" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="commercial">Balanceado comercial</option>
                      <option value="homemade">Casero</option>
                      <option value="mixed">Mixto</option>
                      <option value="raw">BARF / Crudo</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Marca / alimento específico</label>
                    <input v-model.trim="form.feedingBrand" type="text" placeholder="Ej: Royal Canin Adult" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>Ambiente</label>
                    <select v-model="form.environment" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="indoor">Interior</option>
                      <option value="outdoor">Exterior</option>
                      <option value="both">Mixto (interior/exterior)</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Viajes recientes</label>
                    <input v-model.trim="form.recentTravel" type="text" placeholder="Destino y fecha aproximada…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.vaccinationHistory') }}
                      <span v-if="loadingHistory" class="history-loading">⏳ cargando…</span>
                      <span v-else-if="form.patientId && !form.vaccinationHistory" class="history-empty">sin registros</span>
                    </label>
                    <textarea v-model.trim="form.vaccinationHistory" rows="3" placeholder="Vacunas aplicadas, fechas y laboratorio…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.dewormingHistory') }}
                      <span v-if="loadingHistory" class="history-loading">⏳ cargando…</span>
                      <span v-else-if="form.patientId && !form.dewormingHistory" class="history-empty">sin registros</span>
                    </label>
                    <textarea v-model.trim="form.dewormingHistory" rows="3" placeholder="Antiparasitarios internos/externos, productos y fechas…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.previousIllnesses') }}</label>
                    <textarea v-model.trim="form.previousIllnesses" rows="2" :placeholder="t('evolutions.previousIllnessesPlaceholder')" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.previousSurgeries') }}
                      <span v-if="loadingHistory" class="history-loading">⏳ cargando…</span>
                      <span v-else-if="form.patientId && !form.previousSurgeries" class="history-empty">sin cirugías</span>
                    </label>
                    <textarea v-model.trim="form.previousSurgeries" rows="3" :placeholder="t('evolutions.previousProceduresPlaceholder')" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.currentMedications') }}</label>
                    <textarea v-model.trim="form.currentMedications" rows="2" :placeholder="t('evolutions.currentMedicationsPlaceholder')" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.ownerObservations') }}</label>
                    <textarea v-model.trim="form.ownerObservations" rows="2" :placeholder="t('evolutions.ownerObservationsPlaceholder')" :disabled="saving" />
                  </div>
                </div>
              </div>

              <!-- TAB 2: Examen físico -->
              <div v-show="activeTab === 2">
                <div class="section-title">{{ t('evolutions.physicalExam') }}</div>
                <div class="form-grid">
                  <div class="field">
                    <label>{{ t('evolutions.mucousMembranes') }}</label>
                    <select v-model="form.mucousMembranes" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="rosadas humidas">Rosadas y húmedas (normal)</option>
                      <option value="palidas">Pálidas</option>
                      <option value="cianoticas">Cianóticas</option>
                      <option value="ictericas">Ictéricas</option>
                      <option value="congestionadas">Congestionadas</option>
                      <option value="secas">Secas</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.hydrationStatus') }}</label>
                    <select v-model="form.hydrationStatus" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="normal">Normal (&lt; 5%)</option>
                      <option value="deshidratacion leve 5%">Deshidratación leve 5%</option>
                      <option value="deshidratacion moderada 8%">Deshidratación moderada 8%</option>
                      <option value="deshidratacion severa 10%">Deshidratación severa ≥10%</option>
                    </select>
                  </div>
                  <div class="field field--full">
                    <label>Ganglios linfáticos</label>
                    <input v-model.trim="form.lymphNodes" type="text" placeholder="Tamaño, consistencia, sensibilidad…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.skinCoat') }}</label>
                    <input v-model.trim="form.skinCoat" type="text" :placeholder="t('evolutions.skinCoat')" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>Ojos</label>
                    <input v-model.trim="form.eyes" type="text" placeholder="Secreción, opacidad, reflejo pupilar…" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>Oídos</label>
                    <input v-model.trim="form.ears" type="text" placeholder="Secreción, eritema, olor…" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>Nariz y faringe</label>
                    <input v-model.trim="form.noseThroat" type="text" placeholder="Secreción nasal, mucosas, faringe…" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>Cavidad oral</label>
                    <input v-model.trim="form.oralCavity" type="text" placeholder="Dientes, encías, lengua, sarro…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Cardiovascular</label>
                    <input v-model.trim="form.cardiovascular" type="text" placeholder="Ritmo cardíaco, soplos, calidad de pulso…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Respiratorio</label>
                    <input v-model.trim="form.respiratory" type="text" placeholder="Murmullo vesicular, crepitantes, sibilancias, patrón respiratorio…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Abdomen</label>
                    <input v-model.trim="form.abdomen" type="text" placeholder="Palpación, dolor, órganos palpables, masas, distensión…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Sistema musculoesquelético</label>
                    <input v-model.trim="form.musculoskeletal" type="text" placeholder="Postura, masa muscular, movilidad articular, claudicación…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Sistema neurológico</label>
                    <input v-model.trim="form.neurological" type="text" :placeholder="t('evolutions.neurological')" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Sistema urogenital</label>
                    <input v-model.trim="form.urogenital" type="text" placeholder="Riñones, vejiga, genitales externos…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Evaluación del dolor</label>
                    <input v-model.trim="form.painAssessment" type="text" placeholder="Escala 0–10, localización, tipo de dolor…" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Observaciones generales del examen físico</label>
                    <textarea v-model.trim="form.generalObservations" rows="3" :placeholder="t('evolutions.generalObservations')" :disabled="saving" />
                  </div>
                </div>
              </div>

              <!-- TAB 3: Diagnóstico -->
              <div v-show="activeTab === 3">
                <div class="section-title">{{ t('evolutions.diagnosis') }}</div>
                <div class="form-grid">
                  <div class="field field--full">
                    <label>Nombre del diagnóstico</label>
                    <input v-model.trim="form.diagnosisName" type="text" :placeholder="t('evolutions.diagnosisNamePlaceholder')" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.diagnosisType') }}</label>
                    <select v-model="form.diagnosisType" :disabled="saving">
                      <option value="presumptive">{{ t('evolutions.diagnosisTypePresumptive') }}</option>
                      <option value="definitive">{{ t('evolutions.diagnosisTypeDefinitive') }}</option>
                      <option value="differential">{{ t('evolutions.diagnosisTypeDifferential') }}</option>
                      <option value="rule_out">{{ t('evolutions.diagnosisTypeRuleOut') }}</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.diagnosisCode') }}</label>
                    <input v-model.trim="form.diagnosisCode" type="text" :placeholder="t('evolutions.diagnosisCodePlaceholder')" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.prognosis') }}</label>
                    <select v-model="form.prognosis" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="excellent">{{ t('evolutions.prognosisExcellent') }}</option>
                      <option value="good">{{ t('evolutions.prognosisGood') }}</option>
                      <option value="fair">{{ t('evolutions.prognosisFair') }}</option>
                      <option value="guarded">{{ t('evolutions.prognosisGuarded') }}</option>
                      <option value="poor">{{ t('evolutions.prognosisPoor') }}</option>
                      <option value="grave">{{ t('evolutions.prognosisGrave') }}</option>
                    </select>
                  </div>
                  <div class="field field--full">
                    <label class="checkbox-label" style="flex-direction:row;align-items:center;gap:8px">
                      <input type="checkbox" v-model="form.isPrimary" :disabled="saving" />
                      {{ t('evolutions.primaryDiagnosis') }}
                    </label>
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.diagnosisNotes') }}</label>
                    <textarea v-model.trim="form.diagnosisNotes" rows="3" :placeholder="t('evolutions.diagnosisNotes')" :disabled="saving" />
                  </div>
                </div>
              </div>

              <!-- TAB 4: Tratamientos -->
              <div v-show="activeTab === 4">
                <div class="section-title">{{ t('evolutions.treatment') }}</div>
                <div class="form-grid">
                  <div class="field">
                    <label>{{ t('evolutions.treatmentType') }}</label>
                    <select v-model="form.treatment.treatmentType" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="medication">{{ t('evolutions.treatmentTypeMedication') }}</option>
                      <option value="procedure">{{ t('evolutions.treatmentTypeProcedure') }}</option>
                      <option value="surgery_ref">{{ t('evolutions.treatmentTypeSurgeryRef') }}</option>
                      <option value="specialist_ref">{{ t('evolutions.treatmentTypeSpecialistRef') }}</option>
                      <option value="diagnostic">{{ t('evolutions.treatmentTypeDiagnostic') }}</option>
                      <option value="nursing">{{ t('evolutions.treatmentTypeNursing') }}</option>
                      <option value="physical_therapy">{{ t('evolutions.treatmentTypePhysicalTherapy') }}</option>
                      <option value="other">{{ t('evolutions.other') }}</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.treatmentStart') }}</label>
                    <input v-model="form.treatment.startDate" type="date" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.treatmentDescription') }}</label>
                    <textarea v-model.trim="form.treatment.description" rows="2" :placeholder="t('evolutions.treatmentDescription')" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.dose') }}</label>
                    <input v-model.trim="form.treatment.dose" type="text" :placeholder="t('evolutions.dosePlaceholder')" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.doseUnit') }}</label>
                    <input v-model.trim="form.treatment.doseUnit" type="text" :placeholder="t('evolutions.doseUnitPlaceholder')" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.frequency') }}</label>
                    <input v-model.trim="form.treatment.frequency" type="text" :placeholder="t('evolutions.frequencyPlaceholder')" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.route') }}</label>
                    <select v-model="form.treatment.route" :disabled="saving">
                      <option value="">{{ t('common.choose') }}</option>
                      <option value="oral">{{ t('evolutions.routeOral') }}</option>
                      <option value="iv">{{ t('evolutions.routeIv') }}</option>
                      <option value="im">{{ t('evolutions.routeIm') }}</option>
                      <option value="sc">{{ t('evolutions.routeSc') }}</option>
                      <option value="topical">{{ t('evolutions.routeTopical') }}</option>
                      <option value="inhalation">{{ t('evolutions.routeInhalation') }}</option>
                      <option value="ophthalmic">{{ t('evolutions.routeOphthalmic') }}</option>
                      <option value="otic">{{ t('evolutions.routeOtic') }}</option>
                      <option value="rectal">{{ t('evolutions.routeRectal') }}</option>
                      <option value="other">{{ t('evolutions.routeOther') }}</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>{{ t('evolutions.durationDays') }}</label>
                    <input v-model.number="form.treatment.durationDays" type="number" min="1" placeholder="7" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.treatmentNotes') }}</label>
                    <textarea v-model.trim="form.treatment.notes" rows="2" :placeholder="t('evolutions.treatmentNotes')" :disabled="saving" />
                  </div>
                </div>
              </div>

              <!-- TAB 5: Órdenes -->
              <div v-show="activeTab === 5">
                <div class="section-title">Laboratorio</div>
                <div class="form-grid">
                  <div class="field">
                    <label>Prioridad</label>
                    <select v-model="form.labOrder.priority" :disabled="saving">
                      <option value="routine">Rutina</option>
                      <option value="urgent">Urgente</option>
                      <option value="emergency">Emergencia</option>
                    </select>
                  </div>
                  <div class="field field--full">
                    <label>Notas clínicas para laboratorio</label>
                    <textarea v-model.trim="form.labOrder.clinicalNotes" rows="2" placeholder="Motivo del pedido, sospecha diagnóstica, observaciones..." :disabled="saving" />
                  </div>
                </div>
                <div v-if="loadingLabTests" class="loading-state" style="padding:20px 0">
                  <span class="spin spin--dark" /> Cargando pruebas de laboratorio…
                </div>
                <div v-else class="tests-catalog">
                  <div v-for="(tests, category) in groupedLabTests" :key="category" class="test-category">
                    <div class="test-category__title">{{ category }}</div>
                    <div class="test-category__items">
                      <label v-for="test in tests" :key="test.id" class="test-checkbox-label">
                        <input v-model="form.labOrder.tests" type="checkbox" :value="test.id" :disabled="saving" />
                        <div class="test-info">
                          <strong>{{ test.name }}</strong>
                          <span v-if="test.code" class="sub">{{ test.code }}</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div class="section-title" style="margin-top:18px">Imágenes</div>
                <div class="form-grid">
                  <div class="field">
                    <label>Tipo de estudio</label>
                    <select v-model="form.imagingOrder.imagingTypeId" :disabled="saving || loadingImagingTypes">
                      <option value="">{{ loadingImagingTypes ? 'Cargando tipos…' : 'Seleccionar estudio' }}</option>
                      <option v-for="type in imagingTypes" :key="type.id" :value="type.id">
                        {{ type.name }}{{ type.modality ? ' · ' + type.modality : '' }}
                      </option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Prioridad</label>
                    <select v-model="form.imagingOrder.priority" :disabled="saving">
                      <option value="routine">Rutina</option>
                      <option value="urgent">Urgente</option>
                      <option value="emergency">Emergencia</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Región anatómica</label>
                    <input v-model.trim="form.imagingOrder.bodyRegion" type="text" placeholder="Tórax, abdomen, miembro posterior..." :disabled="saving" />
                  </div>
                  <label class="checkbox-label">
                    <input v-model="form.imagingOrder.sedationRequired" type="checkbox" :disabled="saving" />
                    Requiere sedación
                  </label>
                  <div class="field field--full">
                    <label>Indicación clínica</label>
                    <textarea v-model.trim="form.imagingOrder.clinicalIndication" rows="3" placeholder="Sospecha clínica, hallazgos del examen, objetivo del estudio..." :disabled="saving" />
                  </div>
                </div>

                <div class="section-title" style="margin-top:18px">Internación</div>
                <div class="form-grid">
                  <div class="field">
                    <label>Veterinario responsable</label>
                    <select v-model="form.hospitalizationOrder.responsibleVetId" :disabled="saving || loadingProfessionals">
                      <option value="">{{ loadingProfessionals ? 'Cargando profesionales…' : 'Seleccionar veterinario' }}</option>
                      <option v-for="professional in hospitalizationProfessionals" :key="professional.id" :value="String(professional.id)">
                        {{ professional.label }}
                      </option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Sala</label>
                    <select v-model="form.hospitalizationOrder.wardId" :disabled="saving || wardsLoading" @change="form.hospitalizationOrder.kennelId = ''">
                      <option value="">{{ wardsLoading ? 'Cargando salas…' : 'Seleccionar sala' }}</option>
                      <option v-for="ward in availableWards" :key="ward.id" :value="ward.id">
                        {{ ward.name }}{{ ward.available_kennels != null ? ' (' + ward.available_kennels + ' libres)' : '' }}
                      </option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Jaula</label>
                    <select v-model="form.hospitalizationOrder.kennelId" :disabled="saving || !form.hospitalizationOrder.wardId">
                      <option value="">Sin jaula asignada</option>
                      <option v-for="kennel in freeKennelsForEvolutionWard" :key="kennel.id" :value="kennel.id">
                        Jaula {{ kennel.number }}{{ kennel.kennel_type ? ' (' + kennel.kennel_type + ')' : '' }}
                      </option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Peso ingreso</label>
                    <input v-model.number="form.hospitalizationOrder.admissionWeight" type="number" min="0" step="0.01" placeholder="Ej: 12.4" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>Alta estimada</label>
                    <input v-model="form.hospitalizationOrder.estimatedDischargeDate" type="date" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Motivo de internación</label>
                    <textarea v-model.trim="form.hospitalizationOrder.hospitalizationReason" rows="2" placeholder="Razón clínica para internar al paciente..." :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Diagnóstico de ingreso</label>
                    <textarea v-model.trim="form.hospitalizationOrder.admissionDiagnosis" rows="2" placeholder="Diagnóstico inicial o presuntivo..." :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Indicaciones especiales</label>
                    <textarea v-model.trim="form.hospitalizationOrder.specialInstructions" rows="2" placeholder="Aislamiento, monitoreo, cuidados, dieta..." :disabled="saving" />
                  </div>
                </div>

                <div class="section-title" style="margin-top:18px">Cirugía</div>
                <div class="form-grid">
                  <div class="field">
                    <label>Tipo de cirugía</label>
                    <select v-model="form.surgeryOrder.surgeryTypeId" :disabled="saving || loadingSurgeryTypes">
                      <option value="">{{ loadingSurgeryTypes ? 'Cargando tipos…' : 'Seleccionar cirugía' }}</option>
                      <optgroup v-for="(types, category) in groupedSurgeryTypes" :key="category" :label="category">
                        <option v-for="type in types" :key="type.id" :value="type.id">
                          {{ type.name }}{{ type.estimated_duration_minutes ? ' · ' + type.estimated_duration_minutes + ' min est.' : '' }}
                        </option>
                      </optgroup>
                    </select>
                  </div>
                  <div class="field">
                    <label>Cirujano responsable</label>
                    <select v-model="form.surgeryOrder.leadSurgeonId" :disabled="saving || loadingProfessionals">
                      <option value="">{{ loadingProfessionals ? 'Cargando profesionales…' : 'Seleccionar cirujano' }}</option>
                      <option v-for="professional in surgeryProfessionals" :key="professional.id" :value="String(professional.id)">
                        {{ professional.label }}
                      </option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Fecha programada</label>
                    <input v-model="form.surgeryOrder.scheduledDate" type="date" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>Hora estimada</label>
                    <input v-model="form.surgeryOrder.startTime" type="time" :disabled="saving" />
                  </div>
                  <div class="field">
                    <label>Urgencia</label>
                    <select v-model="form.surgeryOrder.urgency" :disabled="saving">
                      <option value="elective">Electiva</option>
                      <option value="urgent">Urgente</option>
                      <option value="emergency">Emergencia</option>
                    </select>
                  </div>
                  <div class="field field--full">
                    <label>Diagnóstico preoperatorio</label>
                    <textarea v-model.trim="form.surgeryOrder.preoperativeDiagnosis" rows="2" placeholder="Indicación clínica, diagnóstico presuntivo o definitivo..." :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Abordaje quirúrgico</label>
                    <input v-model.trim="form.surgeryOrder.surgicalApproach" type="text" placeholder="Línea media, lateral, artrotomía, etc." :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>Notas quirúrgicas</label>
                    <textarea v-model.trim="form.surgeryOrder.notes" rows="2" placeholder="Preparación, consideraciones anestésicas, materiales, observaciones..." :disabled="saving" />
                  </div>
                </div>
              </div>

              <!-- TAB 6: Recetas -->
              <div v-show="activeTab === 6">
                <div class="section-title">{{ t('evolutions.prescription') }}</div>

                <!-- Agregar ítem -->
                <div class="rx-add-item">
                  <div class="form-grid">
                    <div class="field">
                      <label>{{ t('evolutions.medicationLabel') }} <span class="req">*</span></label>
                      <input v-model.trim="newRxItem.medicationName" type="text" :placeholder="t('evolutions.medicationPlaceholder')" :disabled="saving" />
                    </div>
                    <div class="field">
                      <label>{{ t('evolutions.dose') }} <span class="req">*</span></label>
                      <input v-model.trim="newRxItem.dose" type="text" :placeholder="t('evolutions.dosePlaceholder')" :disabled="saving" />
                    </div>
                    <div class="field">
                      <label>{{ t('evolutions.doseUnit') }}</label>
                      <input v-model.trim="newRxItem.doseUnit" type="text" :placeholder="t('evolutions.doseUnitPlaceholder')" :disabled="saving" />
                    </div>
                    <div class="field">
                      <label>{{ t('evolutions.frequency') }} <span class="req">*</span></label>
                      <input v-model.trim="newRxItem.frequency" type="text" :placeholder="t('evolutions.frequencyPlaceholder')" :disabled="saving" />
                    </div>
                    <div class="field">
                      <label>{{ t('evolutions.route') }}</label>
                      <input v-model.trim="newRxItem.route" type="text" :placeholder="t('evolutions.routePlaceholder')" :disabled="saving" />
                    </div>
                    <div class="field">
                      <label>{{ t('evolutions.durationDays') }}</label>
                      <input v-model.number="newRxItem.durationDays" type="number" min="1" placeholder="7" :disabled="saving" />
                    </div>
                    <div class="field">
                      <label>{{ t('evolutions.quantity') }}</label>
                      <input v-model.number="newRxItem.quantity" type="number" min="0" step="0.5" :placeholder="t('evolutions.quantityPlaceholder')" :disabled="saving" />
                    </div>
                    <div class="field field--full">
                      <label>{{ t('evolutions.ownerInstructions') }}</label>
                      <textarea v-model.trim="newRxItem.instructions" rows="2" :placeholder="t('evolutions.ownerInstructionsPlaceholder')" :disabled="saving" />
                    </div>
                  </div>
                  <div style="display:flex;justify-content:flex-end;margin-top:10px">
                    <button type="button" class="btn-ghost btn-sm" @click="addRxItem()" :disabled="saving">+ {{ t('evolutions.addItem') }}</button>
                  </div>
                </div>

                <!-- Lista de ítems agregados -->
                <div v-if="form.prescriptionItems.length > 0" style="margin-top:14px">
                  <div class="section-title">{{ t('evolutions.prescriptionItems') }} ({{ form.prescriptionItems.length }})</div>
                  <div class="rx-item-list">
                    <div v-for="(item, idx) in form.prescriptionItems" :key="idx" class="rx-item">
                      <div class="rx-item__info">
                        <strong>{{ item.medicationName }}</strong>
                        <span>{{ item.dose }}{{ item.doseUnit ? ' ' + item.doseUnit : '' }} — {{ item.frequency }}</span>
                        <span v-if="item.route" class="sub">{{ t('evolutions.route') }}: {{ item.route }}</span>
                        <span v-if="item.durationDays" class="sub">{{ item.durationDays }} {{ t('evolutions.durationDays') }}</span>
                      </div>
                      <button type="button" class="rx-item__remove" @click="removeRxItem(idx)" :disabled="saving" :title="t('evolutions.deleteItem')">✕</button>
                    </div>
                  </div>
                </div>

                <!-- Datos generales de la receta -->
                <div class="form-grid" style="margin-top:14px">
                  <div class="field">
                    <label>{{ t('evolutions.allowedRefills') }}</label>
                    <input v-model.number="form.prescriptionRefills" type="number" min="0" :placeholder="t('evolutions.allowedRefillsPlaceholder')" :disabled="saving" />
                  </div>
                  <div class="field field--full">
                    <label>{{ t('evolutions.prescriptionNotes') }}</label>
                    <textarea v-model.trim="form.prescriptionNotes" rows="2" :placeholder="t('evolutions.prescriptionNotes')" :disabled="saving" />
                  </div>
                </div>
              </div>

            </div>

            <div v-if="saveError" class="alert alert--error mx">{{ saveError }}</div>

            <div class="modal__actions">
              <div class="tab-nav-btns">
                <button type="button" class="btn-ghost btn-sm" @click="activeTab = Math.max(0, activeTab - 1)" :disabled="activeTab === 0">{{ t('evolutions.previous') }}</button>
                <button type="button" class="btn-ghost btn-sm" @click="activeTab = Math.min(tabs.length - 1, activeTab + 1)" :disabled="activeTab === tabs.length - 1">{{ t('evolutions.next') }}</button>
              </div>
              <div style="display:flex;gap:10px">
                <button type="button" class="btn-ghost" @click="closeModal()" :disabled="saving">{{ t('evolutions.cancel') }}</button>
                <button type="submit" class="btn-primary" :disabled="saving">
                  <span v-if="saving" class="spin spin--sm" />
                  <span v-else>💾 {{ t('evolutions.saveEvolution') }}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref, reactive, onMounted } from 'vue'
import http from '../api/client'
import { adminUsersApi } from '../api/adminUsers'
import { t } from '../i18n'
import { useAuthStore } from '../stores/auth'

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return [value]
}

function normalizeMedicalRecord(row) {
  if (!row || typeof row !== 'object') return null
  const anamnesis = row.anamnesis ?? row.history ?? null
  const physicalExam = row.physicalExam ?? row.physical_exam ?? null
  return {
    ...row,
    id: row.id ?? row.record_id ?? row.recordId ?? null,
    patient_id: row.patient_id ?? row.patientId ?? row.patient?.id ?? null,
    patient_name: row.patient_name ?? row.patient?.name ?? row.patientName ?? '',
    vet_name: row.vet_name ?? row.vet?.name ?? row.vetName ?? '',
    species: row.species ?? row.species_name ?? row.speciesName ?? '',
    chief_complaint: row.chief_complaint ?? row.chiefComplaint ?? '',
    visit_date: row.visit_date ?? row.visitDate ?? null,
    opened_at: row.opened_at ?? row.openedAt ?? null,
    status: row.status ?? '',
    weight_kg: row.weight_kg ?? row.weightKg ?? null,
    temperature_celsius: row.temperature_celsius ?? row.temperatureCelsius ?? null,
    signed_at: row.signed_at ?? row.signedAt ?? null,
    notes: row.notes ?? '',
    diagnoses: asArray(row.diagnoses),
    treatments: asArray(row.treatments),
    prescriptions: asArray(row.prescriptions),
    anamnesisText: stringifyClinicalBlock(anamnesis),
    physicalExamText: stringifyClinicalBlock(physicalExam),
  }
}

function normalizePatient(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    id: row.id ?? row.patient_id ?? row.patientId ?? null,
    name: row.name ?? row.full_name ?? row.fullName ?? '',
    species: row.species ?? row.species_name ?? row.speciesName ?? '',
    primary_owner: row.primary_owner ?? row.owner_name ?? row.ownerName ?? '',
    hc_number: row.hc_number ?? row.hcNumber ?? '',
  }
}

const items      = ref([])
const loading    = ref(false)
const error      = ref('')
const showDetail = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detailRecord = ref(null)
const search     = ref('')
const dateFrom   = ref('')
const dateTo     = ref('')
const pagination = ref({ page: 1, totalPages: 1 })
const auth = useAuthStore()
const CLINICAL_ROLES = ['veterinarian', 'surgeon', 'vet_technician', 'tele_vet']
const HOSPITALIZATION_ROLES = ['veterinarian', 'surgeon', 'tele_vet']
const SURGERY_ROLES = ['veterinarian', 'surgeon']

const tabs = [
  { label: t('evolutions.generalData'), icon: '📝' },
  { label: t('evolutions.history'), icon: '🗒️'  },
  { label: t('evolutions.physicalExam'), icon: '🔬' },
  { label: t('evolutions.diagnosis'), icon: '🩺' },
  { label: t('evolutions.treatment'), icon: '💊' },
  { label: 'Órdenes', icon: '🧪' },
  { label: t('evolutions.prescription'), icon: '📄' },
]
const activeTab = ref(0)
const labTests = ref([])
const imagingTypes = ref([])
const surgeryTypes = ref([])
const loadingLabTests = ref(false)
const loadingImagingTypes = ref(false)
const loadingSurgeryTypes = ref(false)
const availableWards = ref([])
const wardsLoading = ref(false)
const orderCatalogErrors = reactive({
  labTests: '',
  imagingTypes: '',
  surgeryTypes: '',
  wards: '',
})
const professionals = ref([])
const loadingProfessionals = ref(false)

const groupedLabTests = computed(() => {
  const groups = {}
  labTests.value.forEach((test) => {
    const category = test.category || 'General'
    if (!groups[category]) groups[category] = []
    groups[category].push(test)
  })
  return groups
})

const freeKennelsForEvolutionWard = computed(() => {
  if (!form.hospitalizationOrder.wardId) return []
  const ward = availableWards.value.find((entry) => entry.id === form.hospitalizationOrder.wardId)
  if (!ward || !ward.kennels) return []
  return ward.kennels.filter((kennel) => kennel.status === 'available' || kennel.status === 'free')
})

const groupedSurgeryTypes = computed(() => {
  const groups = {}
  surgeryTypes.value.forEach((type) => {
    const category = type.category || 'General'
    if (!groups[category]) groups[category] = []
    groups[category].push(type)
  })
  return groups
})

const orderCatalogError = computed(() => Object.values(orderCatalogErrors).filter(Boolean).join(' | '))

function apiErrorMessage(error, fallback) {
  return error?.response?.data?.error?.message
    || error?.response?.data?.message
    || error?.message
    || fallback
}

const hospitalizationProfessionals = computed(() =>
  professionals.value.filter((entry) => entry.roles.some((role) => HOSPITALIZATION_ROLES.includes(role)))
)

const surgeryProfessionals = computed(() =>
  professionals.value.filter((entry) => entry.roles.some((role) => SURGERY_ROLES.includes(role)))
)

const freeKennelsForDetailWard = computed(() => {
  if (!detailOrders.hospitalization.wardId) return []
  const ward = availableWards.value.find((entry) => entry.id === detailOrders.hospitalization.wardId)
  if (!ward || !ward.kennels) return []
  return ward.kennels.filter((kennel) => kennel.status === 'available' || kennel.status === 'free')
})

function petEmoji(s) {
  if (!s) return '🐾'
  const sl = s.toLowerCase()
  const m = { perro:'🐶', dog:'🐶', gato:'🐱', cat:'🐱', conejo:'🐰', rabbit:'🐰', loro:'🦜', bird:'🦜', pez:'🐟', fish:'🐟', tortuga:'🐢', reptile:'🦎', hamster:'🐹' }
  return m[sl] || '🐾'
}

function statusLabel(s) {
  const map = { open: 'Abierta', signed: 'Firmada', amended: 'Enmendada' }
  return map[s] || s || '—'
}

function stringifyClinicalBlock(block) {
  if (!block) return ''
  if (typeof block === 'string') return block
  if (typeof block !== 'object') return ''
  return Object.entries(block)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${labelizeKey(key)}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join('\n')
}

function labelizeKey(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^\w/, (m) => m.toUpperCase())
}

function normalizeRoleList(input) {
  if (Array.isArray(input)) {
    return input
      .flatMap((entry) => normalizeRoleList(entry))
      .filter(Boolean)
  }
  if (!input) return []
  if (typeof input === 'string') {
    return input.split(',').map((entry) => entry.trim()).filter(Boolean)
  }
  if (typeof input === 'object') {
    return normalizeRoleList(input.name || input.code || input.role || input.slug)
  }
  return []
}

function normalizeProfessional(row) {
  if (!row) return null
  const roles = normalizeRoleList(row.roles)
  const id = row.id ?? row.user_id ?? row.userId ?? null
  if (!id) return null
  return {
    id,
    roles,
    isActive: row.is_active ?? row.isActive ?? row.active ?? true,
    label: [
      [row.first_name, row.last_name].filter(Boolean).join(' ').trim(),
      row.name,
      row.email,
      `#${id}`,
    ].find(Boolean),
  }
}

function currentUserProfessional() {
  const currentUser = auth.user || {}
  const roles = normalizeRoleList(auth.roles)
  if (!roles.some((role) => CLINICAL_ROLES.includes(role))) return null
  return normalizeProfessional({
    id: currentUser.id || currentUser.userId || null,
    first_name: currentUser.first_name || currentUser.firstName || currentUser.name || '',
    last_name: currentUser.last_name || currentUser.lastName || '',
    email: currentUser.email || '',
    roles,
    is_active: true,
  })
}

function preferredProfessionalId(list) {
  const self = currentUserProfessional()
  if (self && list.some((entry) => entry.id === self.id)) return String(self.id)
  if (list.length === 1) return String(list[0].id)
  return ''
}

// Patient autocomplete
const patientSearch        = ref('')
const patientResults       = ref([])
const selectedPatientLabel = ref('')
const loadingHistory       = ref(false)
let patientTimer = null

async function searchPatients() {
  clearTimeout(patientTimer)
  form.patientId = ''
  selectedPatientLabel.value = ''
  if (patientSearch.value.length < 2) { patientResults.value = []; return }
  patientTimer = setTimeout(async () => {
    try {
      const { data } = await http.get('/patients', { params: { search: patientSearch.value, limit: 8 } })
      patientResults.value = asArray(data?.data || data?.patients || data).map(normalizePatient).filter(Boolean)
    } catch { patientResults.value = [] }
  }, 300)
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function selectPatient(pt) {
  form.patientId = pt.id
  selectedPatientLabel.value = `${pt.name}${pt.hc_number ? ' · HC ' + pt.hc_number : ''}${pt.primary_owner ? ' — ' + pt.primary_owner : ''}`
  patientSearch.value = pt.name
  patientResults.value = []

  // Pre-cargar historial del paciente desde la DB
  loadingHistory.value = true
  try {
    const [vacRes, dewRes, surgRes] = await Promise.allSettled([
      http.get('/vaccinations', { params: { patientId: pt.id, limit: 50 } }),
      http.get('/vaccinations/deworming', { params: { patientId: pt.id, limit: 50 } }),
      http.get('/surgeries', { params: { patientId: pt.id, limit: 20 } }),
    ])

    const asArr = r => (r.status === 'fulfilled' ? (Array.isArray(r.value?.data?.data) ? r.value.data.data : []) : [])

    const vacunas = asArr(vacRes)
    if (vacunas.length) {
      form.vaccinationHistory = vacunas
        .map(v => `${fmtDate(v.vaccination_date)} — ${v.vaccine_name}${v.disease_covered ? ' (' + v.disease_covered + ')' : ''}${v.next_due_date ? ' · próximo: ' + fmtDate(v.next_due_date) : ''}`)
        .join('\n')
    }

    const desparasitaciones = asArr(dewRes)
    if (desparasitaciones.length) {
      form.dewormingHistory = desparasitaciones
        .map(d => `${fmtDate(d.deworming_date)} — ${d.product_name}${d.parasite_type ? ' (' + d.parasite_type + ')' : ''}${d.next_due_date ? ' · próximo: ' + fmtDate(d.next_due_date) : ''}`)
        .join('\n')
    }

    const cirugias = asArr(surgRes)
    if (cirugias.length) {
      form.previousSurgeries = cirugias
        .filter(s => s.status === 'completed')
        .map(s => `${fmtDate(s.scheduled_date)} — ${s.surgery_type} (${s.surgery_category}) · ${s.lead_surgeon}`)
        .join('\n')
    }
  } catch { /* historial opcional — no bloquea el formulario */ }
  finally { loadingHistory.value = false }
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function load(page = 1) {
  loading.value = true; error.value = ''
  try {
    const params = { page, limit: 15 }
    const { data } = await http.get('/medical-records', { params })
    let rows = asArray(data?.data || data?.records || data).map(normalizeMedicalRecord).filter(Boolean)
    const needle = search.value.trim().toLowerCase()
    if (needle) {
      rows = rows.filter((row) => [row.patient_name, row.chief_complaint, row.vet_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)));
    }
    if (dateFrom.value || dateTo.value) {
      rows = rows.filter((row) => {
        const source = row.visit_date || row.opened_at;
        if (!source) return false;
        const day = new Date(source).toISOString().slice(0, 10);
        if (dateFrom.value && day < dateFrom.value) return false;
        if (dateTo.value && day > dateTo.value) return false;
        return true;
      });
    }
    items.value = rows
    const m = data.meta || {}
    pagination.value = { page: m.page || page, totalPages: m.totalPages || 1 }
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudieron cargar las evoluciones'
  } finally { loading.value = false }
}

async function openDetail(record) {
  showDetail.value = true
  detailLoading.value = true
  detailError.value = ''
  detailActionError.value = ''
  detailActionSuccess.value = ''
  relatedOrders.lab = []
  relatedOrders.imaging = []
  relatedOrders.surgeries = []
  relatedOrders.hospitalizations = []
  Object.assign(detailOrders, makeDetailOrdersForm())
  detailRecord.value = normalizeMedicalRecord(record)
  try {
    await Promise.all([loadOrderCatalogs(), loadProfessionals()])
    const { data } = await http.get(`/medical-records/${record.id}`)
    detailRecord.value = normalizeMedicalRecord(data?.data || data)
    detailOrders.lab.clinicalNotes = detailRecord.value?.chief_complaint || ''
    detailOrders.imaging.clinicalIndication = detailRecord.value?.chief_complaint || ''
    detailOrders.hospitalization.admissionDiagnosis = detailRecord.value?.chief_complaint || ''
    detailOrders.surgery.preoperativeDiagnosis = detailRecord.value?.chief_complaint || ''
    detailOrders.hospitalization.responsibleVetId = preferredProfessionalId(hospitalizationProfessionals.value)
    detailOrders.surgery.leadSurgeonId = preferredProfessionalId(surgeryProfessionals.value)
    detailOrders.surgery.scheduledDate = new Date().toISOString().slice(0, 10)
    await loadRelatedOrders(detailRecord.value)
  } catch (e) {
    detailError.value = e.response?.data?.message || 'No se pudo cargar el detalle de la ficha'
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  showDetail.value = false
  detailError.value = ''
  detailActionError.value = ''
  detailActionSuccess.value = ''
  detailRecord.value = null
  relatedOrders.lab = []
  relatedOrders.imaging = []
  relatedOrders.surgeries = []
  relatedOrders.hospitalizations = []
}

let timer = null
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 350) }

const showModal = ref(false)
const saving    = ref(false)
const saveError = ref('')

async function loadOrderCatalogs() {
  if (!labTests.value.length) {
    loadingLabTests.value = true
    try {
      const { data } = await http.get('/lab/tests')
      orderCatalogErrors.labTests = ''
      labTests.value = asArray(data?.data || data).map((row) => ({
        ...row,
        id: row.id ?? row.test_id ?? row.testId ?? null,
        name: row.name ?? row.test_name ?? row.testName ?? '',
        category: row.category ?? row.group ?? 'General',
      })).filter((row) => row.id)
    } catch (error) {
      labTests.value = []
      orderCatalogErrors.labTests = `Laboratorio: ${apiErrorMessage(error, 'No se pudieron cargar las pruebas')}`
    }
    finally { loadingLabTests.value = false }
  }

  if (!imagingTypes.value.length) {
    loadingImagingTypes.value = true
    try {
      const { data } = await http.get('/imaging/types')
      orderCatalogErrors.imagingTypes = ''
      imagingTypes.value = asArray(data?.data || data).map((row) => ({
        ...row,
        id: row.id ?? row.type_id ?? row.typeId ?? null,
        name: row.name ?? row.type_name ?? row.typeName ?? '',
        modality: row.modality ?? row.modality_code ?? row.modalityCode ?? '',
      })).filter((row) => row.id)
    } catch (error) {
      imagingTypes.value = []
      orderCatalogErrors.imagingTypes = `Imágenes: ${apiErrorMessage(error, 'No se pudieron cargar los tipos de estudio')}`
    }
    finally { loadingImagingTypes.value = false }
  }

  if (!surgeryTypes.value.length) {
    loadingSurgeryTypes.value = true
    try {
      const { data } = await http.get('/surgeries/types/all')
      orderCatalogErrors.surgeryTypes = ''
      surgeryTypes.value = asArray(data?.data || data).map((row) => ({
        ...row,
        id: row.id ?? row.type_id ?? row.typeId ?? null,
        name: row.name ?? row.type_name ?? row.typeName ?? '',
        category: row.category ?? row.category_name ?? row.categoryName ?? 'General',
        estimated_duration_minutes: row.estimated_duration_minutes ?? row.estimatedDurationMinutes ?? null,
      })).filter((row) => row.id)
    } catch (error) {
      surgeryTypes.value = []
      orderCatalogErrors.surgeryTypes = `Cirugías: ${apiErrorMessage(error, 'No se pudieron cargar los tipos de cirugía')}`
    }
    finally { loadingSurgeryTypes.value = false }
  }

  if (!availableWards.value.length) {
    wardsLoading.value = true
    try {
      const { data } = await http.get('/hospitalizations/wards/availability')
      orderCatalogErrors.wards = ''
      const rows = asArray(data?.data || data?.wards || data)
      const grouped = new Map()
      rows.forEach((row) => {
        const wardId = row.ward_id ?? row.id ?? row.wardId
        if (!wardId) return
        if (!grouped.has(wardId)) {
          grouped.set(wardId, {
            id: wardId,
            name: row.ward_name ?? row.name ?? '',
            ward_type: row.ward_type ?? row.wardType ?? '',
            available_kennels: 0,
            kennels: [],
          })
        }
        const ward = grouped.get(wardId)
        const kennel = {
          id: row.kennel_id ?? row.id ?? row.kennelId ?? null,
          number: row.kennel_number ?? row.number ?? row.kennelNumber ?? '',
          status: row.status ?? '',
          kennel_type: row.kennel_type ?? row.kennelType ?? '',
        }
        if (kennel.id) ward.kennels.push(kennel)
        if (kennel.status === 'available' || kennel.status === 'free') ward.available_kennels += 1
      })
      availableWards.value = Array.from(grouped.values())
    } catch (error) {
      availableWards.value = []
      orderCatalogErrors.wards = `Internación: ${apiErrorMessage(error, 'No se pudieron cargar las salas y jaulas')}`
    }
    finally { wardsLoading.value = false }
  }
}

async function loadProfessionals() {
  loadingProfessionals.value = true
  try {
    const currentRoles = normalizeRoleList(auth.roles)
    const isAdmin = currentRoles.includes('superadmin') || currentRoles.includes('org_admin')

    if (isAdmin) {
      const { data } = await adminUsersApi.list({ limit: 100 })
      professionals.value = asArray(data?.data || data)
        .map(normalizeProfessional)
        .filter((entry) => entry && entry.isActive && entry.roles.some((role) => CLINICAL_ROLES.includes(role)))
      return
    }

    const self = currentUserProfessional()
    professionals.value = self ? [self] : []
  } catch {
    const self = currentUserProfessional()
    professionals.value = self ? [self] : []
  } finally {
    loadingProfessionals.value = false
  }
}

function prefillProfessionalFields() {
  const preferredHospitalization = preferredProfessionalId(hospitalizationProfessionals.value)
  const preferredSurgery = preferredProfessionalId(surgeryProfessionals.value)
  if (!form.hospitalizationOrder.responsibleVetId && preferredHospitalization) {
    form.hospitalizationOrder.responsibleVetId = preferredHospitalization
  }
  if (!form.surgeryOrder.leadSurgeonId && preferredSurgery) {
    form.surgeryOrder.leadSurgeonId = preferredSurgery
  }
}

// Receta — nuevo ítem pendiente de agregar
const newRxItem = reactive({
  medicationName: '', dose: '', doseUnit: '', frequency: '',
  route: '', durationDays: '', quantity: '', instructions: ''
})

function makeDetailOrdersForm() {
  return {
    lab: {
      tests: [],
      priority: 'routine',
      clinicalNotes: '',
    },
    imaging: {
      imagingTypeId: '',
      priority: 'routine',
      clinicalIndication: '',
      bodyRegion: '',
      sedationRequired: false,
    },
    hospitalization: {
      responsibleVetId: '',
      wardId: '',
      kennelId: '',
      hospitalizationReason: '',
      admissionDiagnosis: '',
      admissionWeight: '',
      estimatedDischargeDate: '',
      specialInstructions: '',
    },
    surgery: {
      surgeryTypeId: '',
      leadSurgeonId: '',
      scheduledDate: '',
      startTime: '',
      urgency: 'elective',
      preoperativeDiagnosis: '',
      surgicalApproach: '',
      notes: '',
    },
  }
}

function normalizeRelatedLabOrder(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    id: row.id ?? null,
    medical_record_id: row.medical_record_id ?? row.medicalRecordId ?? null,
    order_number: row.order_number ?? row.orderNumber ?? '',
    status: row.status ?? '',
    priority: row.priority ?? '',
    ordered_at: row.ordered_at ?? row.orderedAt ?? null,
    reported_at: row.reported_at ?? row.reportedAt ?? null,
    test_count: row.test_count ?? row.testCount ?? null,
  }
}

function normalizeRelatedImagingOrder(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    id: row.id ?? null,
    medical_record_id: row.medical_record_id ?? row.medicalRecordId ?? null,
    order_number: row.order_number ?? row.orderNumber ?? '',
    status: row.status ?? '',
    priority: row.priority ?? '',
    ordered_at: row.ordered_at ?? row.orderedAt ?? null,
    imaging_type: row.imaging_type ?? row.imagingType ?? '',
    body_region: row.body_region ?? row.bodyRegion ?? '',
  }
}

function normalizeRelatedSurgery(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    id: row.id ?? null,
    medical_record_id: row.medical_record_id ?? row.medicalRecordId ?? null,
    status: row.status ?? '',
    scheduled_date: row.scheduled_date ?? row.scheduledDate ?? null,
    surgery_type: row.surgery_type ?? row.surgeryType ?? '',
    lead_surgeon: row.lead_surgeon ?? row.leadSurgeon ?? '',
  }
}

function normalizeRelatedHospitalization(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    id: row.id ?? null,
    medical_record_id: row.medical_record_id ?? row.medicalRecordId ?? null,
    admission_date: row.admission_date ?? row.admissionDate ?? null,
    discharge_date: row.discharge_date ?? row.dischargeDate ?? null,
    hospitalization_reason: row.hospitalization_reason ?? row.hospitalizationReason ?? '',
    hospitalization_status: row.hospitalization_status ?? row.hospitalizationStatus ?? row.status ?? '',
    ward_name: row.ward_name ?? row.wardName ?? '',
    kennel_number: row.kennel_number ?? row.kennelNumber ?? '',
  }
}

const detailOrders = reactive(makeDetailOrdersForm())
const detailActionSaving = ref(false)
const detailActionError = ref('')
const detailActionSuccess = ref('')
const relatedOrdersLoading = ref(false)
const relatedOrders = reactive({
  lab: [],
  imaging: [],
  hospitalizations: [],
  surgeries: [],
})

function addRxItem() {
  if (!newRxItem.medicationName || !newRxItem.dose || !newRxItem.frequency) return
  form.prescriptionItems.push({ ...newRxItem })
  Object.keys(newRxItem).forEach(k => newRxItem[k] = '')
}

function removeRxItem(idx) {
  form.prescriptionItems.splice(idx, 1)
}
const fe        = reactive({})

function makeForm() {
  return {
    // General / medical_records
    patientId:            '',
    chiefComplaint:       '',
    reasonForVisit:       '',
    visitDate:            new Date().toISOString().split('T')[0],
    notes:                '',
    // Signos vitales — van a medical_records Y physical_examinations
    weightKg:             '',
    temperatureCelsius:   '',
    heartRate:            '',
    respiratoryRate:      '',
    systolicBp:           '',
    diastolicBp:          '',
    spo2Percent:          '',
    bodyConditionScore:   '',
    // Anamnesis
    currentIllnessHistory: '',
    illnessDuration:      '',
    illnessOnset:         '',
    appetite:             '',
    thirst:               '',
    urination:            '',
    defecation:           '',
    vomiting:             false,
    coughing:             false,
    sneezing:             false,
    pruritus:             false,
    locomotionIssues:     false,
    contactWithAnimals:   false,
    otherSigns:           '',
    feedingType:          '',
    feedingBrand:         '',
    environment:          '',
    recentTravel:         '',
    vaccinationHistory:   '',
    dewormingHistory:     '',
    previousIllnesses:    '',
    previousSurgeries:    '',
    currentMedications:   '',
    ownerObservations:    '',
    // Examen físico — physical_examinations
    mucousMembranes:      '',
    hydrationStatus:      '',
    lymphNodes:           '',
    skinCoat:             '',
    eyes:                 '',
    ears:                 '',
    noseThroat:           '',
    oralCavity:           '',
    cardiovascular:       '',
    respiratory:          '',
    abdomen:              '',
    musculoskeletal:      '',
    neurological:         '',
    urogenital:           '',
    painAssessment:       '',
    generalObservations:  '',
    // Diagnóstico
    diagnosisName:        '',
    diagnosisType:        'presumptive',
    diagnosisCode:        '',
    isPrimary:            true,
    prognosis:            '',
    diagnosisNotes:       '',
    // Tratamiento
    treatment: {
      treatmentType:  '',
      description:    '',
      dose:           '',
      doseUnit:       '',
      frequency:      '',
      route:          '',
      durationDays:   '',
      startDate:      '',
      notes:          '',
    },
    // Ordenes derivadas de la evolucion
    labOrder: {
      tests: [],
      priority: 'routine',
      clinicalNotes: '',
    },
    imagingOrder: {
      imagingTypeId: '',
      priority: 'routine',
      clinicalIndication: '',
      bodyRegion: '',
      sedationRequired: false,
    },
    hospitalizationOrder: {
      responsibleVetId: '',
      wardId: '',
      kennelId: '',
      hospitalizationReason: '',
      admissionDiagnosis: '',
      admissionWeight: '',
      estimatedDischargeDate: '',
      specialInstructions: '',
    },
    surgeryOrder: {
      surgeryTypeId: '',
      leadSurgeonId: '',
      scheduledDate: '',
      startTime: '',
      urgency: 'elective',
      preoperativeDiagnosis: '',
      surgicalApproach: '',
      notes: '',
    },
    // Receta
    prescriptionItems:   [],
    prescriptionNotes:   '',
    prescriptionRefills: '',
  }
}

const form = reactive(makeForm())

async function openModal() {
  Object.assign(form, makeForm())
  patientSearch.value        = ''
  patientResults.value       = []
  selectedPatientLabel.value = ''
  saveError.value            = ''
  Object.keys(fe).forEach(k => delete fe[k])
  activeTab.value = 0
  showModal.value = true
  await Promise.all([loadOrderCatalogs(), loadProfessionals()])
  prefillProfessionalFields()
}
function closeModal() { showModal.value = false }

function validate() {
  Object.keys(fe).forEach(k => delete fe[k])
  if (!form.patientId)      fe.patientId      = 'Requerido'
  if (!form.chiefComplaint) fe.chiefComplaint  = 'Requerido'
  if (Object.keys(fe).length) activeTab.value = 0
  return Object.keys(fe).length === 0
}

function hasAnamnesisData() {
  return !!(form.currentIllnessHistory || form.illnessDuration || form.illnessOnset ||
    form.appetite || form.thirst || form.urination || form.defecation ||
    form.vomiting || form.coughing || form.sneezing || form.pruritus ||
    form.locomotionIssues || form.contactWithAnimals || form.otherSigns ||
    form.feedingType || form.feedingBrand || form.environment || form.recentTravel ||
    form.vaccinationHistory || form.dewormingHistory || form.previousIllnesses ||
    form.previousSurgeries || form.currentMedications || form.ownerObservations)
}

function hasPhysicalExamData() {
  return !!(form.mucousMembranes || form.hydrationStatus || form.lymphNodes || form.skinCoat ||
    form.eyes || form.ears || form.noseThroat || form.oralCavity ||
    form.cardiovascular || form.respiratory || form.abdomen || form.musculoskeletal ||
    form.neurological || form.urogenital || form.painAssessment || form.generalObservations ||
    form.heartRate || form.respiratoryRate || form.systolicBp || form.diastolicBp ||
    form.spo2Percent || form.temperatureCelsius)
}

function hasDiagnosisData() {
  return !!form.diagnosisName
}

async function runDetailAction(action) {
  if (!detailRecord.value?.id || !detailRecord.value?.patient_id) return
  detailActionSaving.value = true
  detailActionError.value = ''
  detailActionSuccess.value = ''
  try {
    await action()
    detailActionSuccess.value = 'Acción clínica registrada'
    const { data } = await http.get(`/medical-records/${detailRecord.value.id}`)
    detailRecord.value = normalizeMedicalRecord(data?.data || data)
    await loadRelatedOrders(detailRecord.value)
  } catch (e) {
    detailActionError.value = e.response?.data?.error?.message || e.response?.data?.message || 'No se pudo registrar la acción clínica'
  } finally {
    detailActionSaving.value = false
  }
}

async function loadRelatedOrders(record = detailRecord.value) {
  if (!record?.id || !record?.patient_id) return
  relatedOrdersLoading.value = true
  try {
    const patientId = record.patient_id
    const recordId = record.id
    const [labRes, imagingRes, surgeryRes, hospRes] = await Promise.allSettled([
      http.get('/lab/orders', { params: { patientId, limit: 100 } }),
      http.get('/imaging/orders', { params: { patientId, limit: 100 } }),
      http.get('/surgeries', { params: { patientId, limit: 100 } }),
      http.get('/hospitalizations', { params: { limit: 100 } }),
    ])

    const takeData = (result) => result.status === 'fulfilled' ? (result.value?.data?.data || result.value?.data?.orders || result.value?.data) : []

    relatedOrders.lab = asArray(takeData(labRes))
      .map(normalizeRelatedLabOrder)
      .filter((row) => row && String(row.medical_record_id) === String(recordId))

    relatedOrders.imaging = asArray(takeData(imagingRes))
      .map(normalizeRelatedImagingOrder)
      .filter((row) => row && String(row.medical_record_id) === String(recordId))

    relatedOrders.surgeries = asArray(takeData(surgeryRes))
      .map(normalizeRelatedSurgery)
      .filter((row) => row && String(row.medical_record_id) === String(recordId))

    relatedOrders.hospitalizations = asArray(takeData(hospRes))
      .map(normalizeRelatedHospitalization)
      .filter((row) => row && String(row.medical_record_id) === String(recordId))
  } finally {
    relatedOrdersLoading.value = false
  }
}

async function submitDetailLabOrder() {
  await runDetailAction(async () => {
    await http.post('/lab/orders', {
      patientId: parseInt(detailRecord.value.patient_id),
      medicalRecordId: detailRecord.value.id,
      priority: detailOrders.lab.priority,
      clinicalNotes: detailOrders.lab.clinicalNotes || detailRecord.value.chief_complaint,
      tests: detailOrders.lab.tests.map((testId) => ({ testId })),
    })
    Object.assign(detailOrders.lab, { tests: [], priority: 'routine', clinicalNotes: detailRecord.value.chief_complaint || '' })
  })
}

async function submitDetailImagingOrder() {
  await runDetailAction(async () => {
    await http.post('/imaging/orders', {
      patientId: parseInt(detailRecord.value.patient_id),
      medicalRecordId: detailRecord.value.id,
      imagingTypeId: parseInt(detailOrders.imaging.imagingTypeId),
      priority: detailOrders.imaging.priority,
      bodyRegion: detailOrders.imaging.bodyRegion || undefined,
      clinicalIndication: detailOrders.imaging.clinicalIndication || detailRecord.value.chief_complaint,
      sedationRequired: !!detailOrders.imaging.sedationRequired,
    })
    Object.assign(detailOrders.imaging, {
      imagingTypeId: '',
      priority: 'routine',
      clinicalIndication: detailRecord.value.chief_complaint || '',
      bodyRegion: '',
      sedationRequired: false,
    })
  })
}

async function submitDetailHospitalization() {
  await runDetailAction(async () => {
    await http.post('/hospitalizations', {
      patientId: parseInt(detailRecord.value.patient_id),
      medicalRecordId: detailRecord.value.id,
      responsibleVetId: parseInt(detailOrders.hospitalization.responsibleVetId),
      wardId: detailOrders.hospitalization.wardId ? parseInt(detailOrders.hospitalization.wardId) : undefined,
      kennelId: detailOrders.hospitalization.kennelId ? parseInt(detailOrders.hospitalization.kennelId) : undefined,
      hospitalizationReason: detailOrders.hospitalization.hospitalizationReason,
      admissionDiagnosis: detailOrders.hospitalization.admissionDiagnosis || undefined,
      admissionWeight: detailOrders.hospitalization.admissionWeight || undefined,
      estimatedDischargeDate: detailOrders.hospitalization.estimatedDischargeDate || undefined,
      specialInstructions: detailOrders.hospitalization.specialInstructions || undefined,
    })
    Object.assign(detailOrders.hospitalization, {
      responsibleVetId: preferredProfessionalId(hospitalizationProfessionals.value),
      wardId: '',
      kennelId: '',
      hospitalizationReason: '',
      admissionDiagnosis: detailRecord.value.chief_complaint || '',
      admissionWeight: '',
      estimatedDischargeDate: '',
      specialInstructions: '',
    })
  })
}

async function submitDetailSurgery() {
  await runDetailAction(async () => {
    const payload = {
      patientId: parseInt(detailRecord.value.patient_id),
      medicalRecordId: detailRecord.value.id,
      surgeryTypeId: parseInt(detailOrders.surgery.surgeryTypeId),
      leadSurgeonId: parseInt(detailOrders.surgery.leadSurgeonId),
      scheduledDate: detailOrders.surgery.startTime
        ? `${detailOrders.surgery.scheduledDate}T${detailOrders.surgery.startTime}`
        : `${detailOrders.surgery.scheduledDate}T09:00`,
      urgency: detailOrders.surgery.urgency || 'elective',
    }
    if (detailOrders.surgery.startTime) payload.startTime = detailOrders.surgery.startTime
    if (detailOrders.surgery.preoperativeDiagnosis) payload.preoperativeDiagnosis = detailOrders.surgery.preoperativeDiagnosis
    if (detailOrders.surgery.surgicalApproach) payload.surgicalApproach = detailOrders.surgery.surgicalApproach
    if (detailOrders.surgery.notes) payload.notes = detailOrders.surgery.notes
    await http.post('/surgeries', payload)
    Object.assign(detailOrders.surgery, {
      surgeryTypeId: '',
      leadSurgeonId: preferredProfessionalId(surgeryProfessionals.value),
      scheduledDate: new Date().toISOString().slice(0, 10),
      startTime: '',
      urgency: 'elective',
      preoperativeDiagnosis: detailRecord.value.chief_complaint || '',
      surgicalApproach: '',
      notes: '',
    })
  })
}

async function handleCreate() {
  if (!validate()) return
  saving.value = true; saveError.value = ''
  try {
    // 1 — Crear registro principal (medical_records)
    const payload = {
      patientId:      parseInt(form.patientId),
      chiefComplaint: form.chiefComplaint,
    }
    if (form.reasonForVisit)     payload.reasonForVisit     = form.reasonForVisit
    if (form.visitDate)          payload.visitDate           = form.visitDate
    if (form.notes)              payload.notes               = form.notes
    if (form.weightKg)           payload.weightKg            = parseFloat(form.weightKg)
    if (form.temperatureCelsius) payload.temperatureC        = parseFloat(form.temperatureCelsius)
    if (form.bodyConditionScore) payload.bodyConditionScore  = parseFloat(form.bodyConditionScore)

    const { data } = await http.post('/medical-records', payload)
    const recordId = data.data?.id || data.id

    // 2 — Anamnesis
    if (hasAnamnesisData()) {
      const an = {
        // currentIllnessHistory es required por el endpoint
        currentIllnessHistory: form.currentIllnessHistory || form.chiefComplaint,
        vomiting:           form.vomiting          ? 1 : 0,
        coughing:           form.coughing          ? 1 : 0,
        sneezing:           form.sneezing          ? 1 : 0,
        pruritus:           form.pruritus          ? 1 : 0,
        locomotionIssues:   form.locomotionIssues  ? 1 : 0,
        contactWithAnimals: form.contactWithAnimals ? 1 : 0,
      }
      if (form.illnessDuration)    an.illnessDuration    = form.illnessDuration
      if (form.illnessOnset)       an.illnessOnset       = form.illnessOnset
      if (form.appetite)           an.appetite           = form.appetite
      if (form.thirst)             an.thirst             = form.thirst
      if (form.urination)          an.urination          = form.urination
      if (form.defecation)         an.defecation         = form.defecation
      if (form.otherSigns)         an.otherSigns         = form.otherSigns
      if (form.feedingType)        an.feedingType        = form.feedingType
      if (form.feedingBrand)       an.feedingBrand       = form.feedingBrand
      if (form.environment)        an.environment        = form.environment
      if (form.recentTravel)       an.recentTravel       = form.recentTravel
      if (form.vaccinationHistory) an.vaccinationHistory = form.vaccinationHistory
      if (form.dewormingHistory)   an.dewormingHistory   = form.dewormingHistory
      if (form.previousIllnesses)  an.previousIllnesses  = form.previousIllnesses
      if (form.previousSurgeries)  an.previousSurgeries  = form.previousSurgeries
      if (form.currentMedications) an.currentMedications = form.currentMedications
      if (form.ownerObservations)  an.ownerObservations  = form.ownerObservations
      await http.post(`/medical-records/${recordId}/anamnesis`, an)
    }

    // 3 — Examen físico (physical_examinations)
    // Nombre de clave camelCase → backend convierte a snake_case automáticamente
    if (hasPhysicalExamData()) {
      const pe = {}
      if (form.temperatureCelsius) pe.temperatureCelsius = parseFloat(form.temperatureCelsius)
      if (form.heartRate)          pe.heartRate          = parseInt(form.heartRate)
      if (form.respiratoryRate)    pe.respiratoryRate    = parseInt(form.respiratoryRate)
      if (form.systolicBp)         pe.systolicBp         = parseInt(form.systolicBp)
      if (form.diastolicBp)        pe.diastolicBp        = parseInt(form.diastolicBp)
      if (form.spo2Percent)        pe.spo2Percent        = parseFloat(form.spo2Percent)
      if (form.weightKg)           pe.weightKg           = parseFloat(form.weightKg)
      if (form.bodyConditionScore) pe.bodyConditionScore = parseFloat(form.bodyConditionScore)
      if (form.mucousMembranes)    pe.mucousMembranes    = form.mucousMembranes
      if (form.hydrationStatus)    pe.hydrationStatus    = form.hydrationStatus
      if (form.lymphNodes)         pe.lymphNodes         = form.lymphNodes
      if (form.skinCoat)           pe.skinCoat           = form.skinCoat
      if (form.eyes)               pe.eyes               = form.eyes
      if (form.ears)               pe.ears               = form.ears
      if (form.noseThroat)         pe.noseThroat         = form.noseThroat
      if (form.oralCavity)         pe.oralCavity         = form.oralCavity
      if (form.cardiovascular)     pe.cardiovascular     = form.cardiovascular
      if (form.respiratory)        pe.respiratory        = form.respiratory
      if (form.abdomen)            pe.abdomen            = form.abdomen
      if (form.musculoskeletal)    pe.musculoskeletal    = form.musculoskeletal
      if (form.neurological)       pe.neurological       = form.neurological
      if (form.urogenital)         pe.urogenital         = form.urogenital
      if (form.painAssessment)     pe.painAssessment     = form.painAssessment
      if (form.generalObservations) pe.generalObservations = form.generalObservations
      await http.post(`/medical-records/${recordId}/physical-exam`, pe)
    }

    // 4 — Diagnóstico
    if (hasDiagnosisData()) {
      await http.post(`/medical-records/${recordId}/diagnoses`, {
        diagnosisName: form.diagnosisName,
        diagnosisType: form.diagnosisType,
        diagnosisCode: form.diagnosisCode  || undefined,
        isPrimary:     form.isPrimary,
        prognosis:     form.prognosis      || undefined,
        notes:         form.diagnosisNotes || undefined,
      })
    }

    // 5 — Tratamiento
    if (form.treatment.treatmentType) {
      const tr = { treatmentType: form.treatment.treatmentType }
      if (form.treatment.description) tr.description  = form.treatment.description
      if (form.treatment.dose)        tr.dose          = form.treatment.dose
      if (form.treatment.doseUnit)    tr.doseUnit      = form.treatment.doseUnit
      if (form.treatment.frequency)   tr.frequency     = form.treatment.frequency
      if (form.treatment.route)       tr.route         = form.treatment.route
      if (form.treatment.durationDays) tr.durationDays = parseInt(form.treatment.durationDays)
      if (form.treatment.startDate)   tr.startDate     = form.treatment.startDate
      if (form.treatment.notes)       tr.notes         = form.treatment.notes
      await http.post(`/medical-records/${recordId}/treatments`, tr)
    }

    if (form.labOrder.tests.length > 0) {
      await http.post('/lab/orders', {
        patientId: parseInt(form.patientId),
        medicalRecordId: recordId,
        priority: form.labOrder.priority,
        clinicalNotes: form.labOrder.clinicalNotes || form.chiefComplaint,
        tests: form.labOrder.tests.map((testId) => ({ testId })),
      })
    }

    if (form.imagingOrder.imagingTypeId) {
      await http.post('/imaging/orders', {
        patientId: parseInt(form.patientId),
        medicalRecordId: recordId,
        imagingTypeId: parseInt(form.imagingOrder.imagingTypeId),
        priority: form.imagingOrder.priority,
        bodyRegion: form.imagingOrder.bodyRegion || undefined,
        clinicalIndication: form.imagingOrder.clinicalIndication || form.chiefComplaint,
        sedationRequired: !!form.imagingOrder.sedationRequired,
      })
    }

    if (form.hospitalizationOrder.hospitalizationReason && form.hospitalizationOrder.responsibleVetId) {
      await http.post('/hospitalizations', {
        patientId: parseInt(form.patientId),
        medicalRecordId: recordId,
        responsibleVetId: parseInt(form.hospitalizationOrder.responsibleVetId),
        wardId: form.hospitalizationOrder.wardId ? parseInt(form.hospitalizationOrder.wardId) : undefined,
        kennelId: form.hospitalizationOrder.kennelId ? parseInt(form.hospitalizationOrder.kennelId) : undefined,
        hospitalizationReason: form.hospitalizationOrder.hospitalizationReason,
        admissionDiagnosis: form.hospitalizationOrder.admissionDiagnosis || undefined,
        admissionWeight: form.hospitalizationOrder.admissionWeight || undefined,
        estimatedDischargeDate: form.hospitalizationOrder.estimatedDischargeDate || undefined,
        specialInstructions: form.hospitalizationOrder.specialInstructions || undefined,
      })
    }

    if (form.surgeryOrder.surgeryTypeId && form.surgeryOrder.leadSurgeonId && form.surgeryOrder.scheduledDate) {
      const surgeryPayload = {
        patientId: parseInt(form.patientId),
        medicalRecordId: recordId,
        surgeryTypeId: parseInt(form.surgeryOrder.surgeryTypeId),
        leadSurgeonId: parseInt(form.surgeryOrder.leadSurgeonId),
        scheduledDate: form.surgeryOrder.startTime
          ? `${form.surgeryOrder.scheduledDate}T${form.surgeryOrder.startTime}`
          : `${form.surgeryOrder.scheduledDate}T09:00`,
        urgency: form.surgeryOrder.urgency || 'elective',
      }
      if (form.surgeryOrder.startTime) surgeryPayload.startTime = form.surgeryOrder.startTime
      if (form.surgeryOrder.preoperativeDiagnosis) surgeryPayload.preoperativeDiagnosis = form.surgeryOrder.preoperativeDiagnosis
      if (form.surgeryOrder.surgicalApproach) surgeryPayload.surgicalApproach = form.surgeryOrder.surgicalApproach
      if (form.surgeryOrder.notes) surgeryPayload.notes = form.surgeryOrder.notes
      await http.post('/surgeries', surgeryPayload)
    }

    // 7 — Receta
    if (form.prescriptionItems.length > 0) {
      const rxPayload = {
        items: form.prescriptionItems.map(item => {
          const i = { medicationName: item.medicationName, dose: item.dose, frequency: item.frequency }
          if (item.doseUnit)     i.doseUnit     = item.doseUnit
          if (item.route)        i.route        = item.route
          if (item.durationDays) i.durationDays = parseInt(item.durationDays)
          if (item.quantity)     i.quantity     = parseFloat(item.quantity)
          if (item.instructions) i.instructions = item.instructions
          return i
        }),
      }
      if (form.prescriptionNotes)   rxPayload.notes   = form.prescriptionNotes
      if (form.prescriptionRefills !== '') rxPayload.refills = parseInt(form.prescriptionRefills)
      await http.post(`/medical-records/${recordId}/prescriptions`, rxPayload)
    }

    closeModal()
    await load()
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || e.response?.data?.message || 'No se pudo guardar la evolución'
  } finally { saving.value = false }
}

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.page-header__left { display: flex; align-items: center; gap: 14px; }
.page-emoji { font-size: 2rem; }
.page-title { font-size: 1.35rem; font-weight: 700; color: var(--text); }
.page-sub   { font-size: 0.82rem; color: var(--text-2); margin-top: 2px; }

.filters { display: flex; gap: 10px; flex-wrap: wrap; }
.filter-input { padding: 9px 13px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.87rem; background: var(--white); color: var(--text); outline: none; }
.filter-input:focus { border-color: var(--primary); }
.filter-input--grow { flex: 1; min-width: 200px; }

.evol-list { display: flex; flex-direction: column; gap: 12px; }
.evol-card { background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; display: grid; grid-template-columns: 130px 1fr; grid-template-rows: auto auto; transition: box-shadow var(--transition); }
.evol-card:hover { box-shadow: var(--shadow); }
.evol-card__aside { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px 12px; background: var(--surface-2); gap: 8px; border-right: 1px solid var(--border); grid-row: 1 / 3; }
.evol-card__emoji { font-size: 2.2rem; }
.evol-card__meta { text-align: center; }
.evol-card__meta strong { display: block; font-size: 0.9rem; color: var(--text); }
.evol-card__meta span   { font-size: 0.75rem; color: var(--text-3); }
.evol-card__body { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.evol-card__section { display: flex; align-items: flex-start; gap: 8px; }
.evol-card__section p { font-size: 0.87rem; color: var(--text-2); line-height: 1.5; flex: 1; }
.evol-card__vitals { display: flex; gap: 8px; flex-wrap: wrap; }
.vital-chip { font-size: 0.78rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 20px; padding: 2px 10px; color: var(--text-2); }
.evol-card__vet { padding: 8px 16px; border-top: 1px solid var(--border); font-size: 0.78rem; color: var(--text-3); background: var(--surface); grid-column: 2; display: flex; align-items: center; justify-content: space-between; }
.evol-status { font-size: 0.72rem; text-transform: capitalize; background: var(--surface-2); padding: 2px 8px; border-radius: 20px; }
.status--open    { background: #D6F3EC; color: #1A9E7F; }
.status--signed  { background: #D6EEFF; color: #1A5FAA; }
.status--amended { background: #FFF3CC; color: #8A6200; }

.evol-tag { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
.evol-tag--blue { background: #D6EEFF; color: #1A5FAA; }

.pagination { display: flex; align-items: center; justify-content: center; gap: 16px; font-size: 0.85rem; color: var(--text-2); }
.pagination button { padding: 6px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: none; cursor: pointer; font-size: 0.82rem; color: var(--text-2); }
.pagination button:hover:not(:disabled) { background: var(--surface-2); }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%); color: white; border: none; border-radius: var(--radius); font-size: 0.9rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: opacity var(--transition), transform var(--transition); }
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost { padding: 10px 20px; background: none; border: 1.5px solid var(--border); border-radius: var(--radius); color: var(--text-2); font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: background var(--transition); }
.btn-ghost:hover:not(:disabled) { background: var(--surface-2); }
.btn-sm { padding: 7px 14px; font-size: 0.82rem; }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); width: 100%; max-width: 860px; max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; }
.modal__header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 14px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--white); z-index: 2; }
.modal__header h3 { font-size: 1.1rem; font-weight: 700; color: var(--text); }
.modal__close { background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--text-3); padding: 4px 8px; border-radius: var(--radius-sm); }
.modal__close:hover { background: var(--surface-2); }

.tabs { display: flex; border-bottom: 2px solid var(--border); background: var(--white); position: sticky; top: 61px; z-index: 1; padding: 0 24px; overflow-x: auto; }
.tab-btn { padding: 10px 18px; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-size: 0.85rem; font-weight: 500; color: var(--text-3); transition: color 0.15s, border-color 0.15s; white-space: nowrap; }
.tab-btn:hover { color: var(--text); }
.tab-btn--active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 700; }

.form-body { padding: 20px 24px 4px; flex: 1; }
.section-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 0.8rem; font-weight: 600; color: var(--text-2); }
.field input, .field select, .field textarea { padding: 8px 11px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.88rem; color: var(--text); background: var(--surface); outline: none; transition: border-color var(--transition); }
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--primary); background: var(--white); }
.field textarea { resize: vertical; }
.field--full { grid-column: 1 / -1; }
.field-error { font-size: 0.73rem; color: var(--danger); }
.req { color: var(--danger); }

.checkbox-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.checkbox-label { display: flex; align-items: center; gap: 7px; font-size: 0.86rem; color: var(--text-2); cursor: pointer; padding: 6px 10px; border: 1.5px solid var(--border); border-radius: var(--radius); transition: background 0.12s; }
.checkbox-label:hover { background: var(--surface-2); }
.checkbox-label input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; }

.modal__actions { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px 20px; border-top: 1px solid var(--border); gap: 12px; position: sticky; bottom: 0; background: var(--white); z-index: 1; }
.tab-nav-btns { display: flex; gap: 8px; }

.alert { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 0.875rem; }
.alert--error { background: #FDEAEA; color: #c0392b; border-left: 3px solid var(--danger); }
.alert--success { background: #D6F3EC; color: #1A9E7F; border-left: 3px solid #1A9E7F; }
.mx { margin: 0 24px 8px; }
.loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-3); font-size: 0.9rem; background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); }
.empty-state__emoji { font-size: 3rem; }
.spin { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
.spin--sm { width: 14px; height: 14px; }
.spin--dark { border-color: rgba(0,0,0,0.1); border-top-color: var(--primary); }
@keyframes spin { to { transform: rotate(360deg); } }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.autocomplete { position: absolute; z-index: 100; background: var(--white); border: 1.5px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; max-height: 200px; overflow-y: auto; top: 100%; left: 0; }
.autocomplete__item { padding: 9px 13px; cursor: pointer; font-size: 0.88rem; }
.autocomplete__item:hover { background: var(--surface-2); }
.autocomplete__owner { font-size: 0.78rem; color: var(--text-3); }
.selected-patient { margin-top: 5px; font-size: 0.82rem; color: var(--primary); font-weight: 500; }
.history-loading { margin-left: 8px; font-size: 0.75rem; color: var(--text-3); font-weight: 400; }
.history-empty   { margin-left: 8px; font-size: 0.75rem; color: var(--text-3); font-style: italic; font-weight: 400; }
.tests-catalog { display: flex; flex-direction: column; gap: 10px; }
.test-category { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius); padding: 10px 12px; }
.test-category__title { font-size: 0.76rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); margin-bottom: 8px; }
.test-category__items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.test-checkbox-label { display: flex; align-items: flex-start; gap: 8px; background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 10px; cursor: pointer; }
.test-info { display: flex; flex-direction: column; gap: 2px; }
.detail-related-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.detail-related-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.detail-actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.detail-action-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 10px; }

/* Receta */
.rx-add-item { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; }
.rx-item-list { display: flex; flex-direction: column; gap: 8px; }
.rx-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; background: var(--white); border: 1.5px solid var(--border); border-radius: var(--radius); padding: 10px 14px; }
.rx-item__info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.rx-item__info strong { font-size: 0.9rem; color: var(--text); }
.rx-item__info span { font-size: 0.8rem; color: var(--text-2); }
.rx-item__remove { background: none; border: none; cursor: pointer; font-size: 0.85rem; color: var(--text-3); padding: 4px 6px; border-radius: var(--radius-sm); flex-shrink: 0; }
.rx-item__remove:hover:not(:disabled) { background: #FDEAEA; color: #c0392b; }

@media (max-width: 700px) {
  .evol-card { grid-template-columns: 1fr; }
  .evol-card__aside { grid-row: auto; flex-direction: row; border-right: none; border-bottom: 1px solid var(--border); }
  .evol-card__vet { grid-column: 1; }
  .form-grid { grid-template-columns: 1fr; }
  .checkbox-grid { grid-template-columns: 1fr 1fr; }
  .test-category__items { grid-template-columns: 1fr; }
  .detail-related-grid { grid-template-columns: 1fr; }
  .detail-actions-grid { grid-template-columns: 1fr; }
  .modal { max-width: 100%; max-height: 100vh; border-radius: 0; }
}
</style>
