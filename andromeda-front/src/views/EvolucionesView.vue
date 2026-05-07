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

              <!-- TAB 5: Recetas -->
              <div v-show="activeTab === 5">
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
import { ref, reactive, onMounted } from 'vue'
import http from '../api/client'
import { t } from '../i18n'

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

const tabs = [
  { label: t('evolutions.generalData'), icon: '📝' },
  { label: t('evolutions.history'), icon: '🗒️'  },
  { label: t('evolutions.physicalExam'), icon: '🔬' },
  { label: t('evolutions.diagnosis'), icon: '🩺' },
  { label: t('evolutions.treatment'), icon: '💊' },
  { label: t('evolutions.prescription'), icon: '📄' },
]
const activeTab = ref(0)

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
  selectedPatientLabel.value = `${pt.name}${pt.primary_owner ? ' — ' + pt.primary_owner : ''}`
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
  detailRecord.value = normalizeMedicalRecord(record)
  try {
    const { data } = await http.get(`/medical-records/${record.id}`)
    detailRecord.value = normalizeMedicalRecord(data?.data || data)
  } catch (e) {
    detailError.value = e.response?.data?.message || 'No se pudo cargar el detalle de la ficha'
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  showDetail.value = false
  detailError.value = ''
  detailRecord.value = null
}

let timer = null
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 350) }

const showModal = ref(false)
const saving    = ref(false)
const saveError = ref('')

// Receta — nuevo ítem pendiente de agregar
const newRxItem = reactive({
  medicationName: '', dose: '', doseUnit: '', frequency: '',
  route: '', durationDays: '', quantity: '', instructions: ''
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
    // Receta
    prescriptionItems:   [],
    prescriptionNotes:   '',
    prescriptionRefills: '',
  }
}

const form = reactive(makeForm())

function openModal() {
  Object.assign(form, makeForm())
  patientSearch.value        = ''
  patientResults.value       = []
  selectedPatientLabel.value = ''
  saveError.value            = ''
  Object.keys(fe).forEach(k => delete fe[k])
  activeTab.value = 0
  showModal.value = true
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

    // 6 — Receta
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
  .modal { max-width: 100%; max-height: 100vh; border-radius: 0; }
}
</style>
