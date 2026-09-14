import assert from 'node:assert/strict'
import { buildHistoryWorkOrderWhere } from '../services/history.service'

const james = { userId: 'james', role: 'maintenance_technician' }
const engineer = { userId: 'engineer', role: 'biomedical_engineer' }
const admin = { userId: 'admin', role: 'hospital_administrator' }

const technicianWhere: any = buildHistoryWorkOrderWhere(james)
assert.deepEqual(technicianWhere.assignedTechnician, { userId: 'james' })
assert.equal('OR' in technicianWhere, false)
assert.equal(technicianWhere.status, 'COMPLETED')

const engineerWhere: any = buildHistoryWorkOrderWhere(engineer)
assert.deepEqual(engineerWhere.OR, [
  { createdById: 'engineer' },
  { assignedTechnician: { userId: 'engineer' } },
])

const adminWhere: any = buildHistoryWorkOrderWhere(admin)
assert.equal('OR' in adminWhere, false)
assert.equal('assignedTechnician' in adminWhere, false)
assert.deepEqual(adminWhere.equipment, {
  sourceDataset: { datasetType: { not: 'HISTORICAL_SAFETY' } },
})

console.log('History scope tests passed')
