import assert from 'node:assert/strict'
import { datasetService } from '../services/dataset.service'

const profile = datasetService.profileParsedDataset({
  fileName: 'equipment.csv',
  fileType: 'text/csv',
  fileSize: 128,
  columns: ['equipment_id', 'temperature', 'failure_target'],
  rows: [
    { equipment_id: 'EQ-1', temperature: 37.5, failure_target: 0 },
    { equipment_id: 'EQ-2', temperature: null, failure_target: 1 },
    { equipment_id: 'EQ-2', temperature: null, failure_target: 1 },
  ],
})

assert.equal(profile.rowCount, 3)
assert.equal(profile.columnCount, 3)
assert.equal(profile.missingTotal, 2)
assert.equal(profile.missingValuePercent, 22.22)
assert.equal(profile.duplicateRows, 1)
assert.deepEqual(profile.numericColumns, ['temperature', 'failure_target'])
assert.deepEqual(profile.possibleIdColumns, ['equipment_id'])
assert.equal(profile.detectedTargetCandidate, 'failure_target')
assert.equal(profile.previewRows.length, 3)
console.log('[PASS] Real dataset profile statistics are based on uploaded rows')
