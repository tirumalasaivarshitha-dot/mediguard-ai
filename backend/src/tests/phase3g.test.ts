import { analyticsService } from '../services/analytics.service'
import { datasetService } from '../services/dataset.service'
import { historicalSafetyService } from '../services/historicalSafety.service'
import { reportService } from '../services/report.service'
import { notificationService } from '../services/notification.service'

async function runPhase3GTests() {
  console.log('--- RUNNING PHASE 3G AUTOMATED TEST SUITE ---')
  let passed = 0
  let failed = 0

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`)
      passed++
    } else {
      console.error(`[FAIL] ${testName}`)
      failed++
    }
  }

  try {
    // 1. Analytics Overview
    const overview = await analyticsService.getOverview()
    assert(overview && typeof overview.total === 'number', '1. Analytics overview returns structure')
    assert(overview.dataMode === 'OPERATIONAL DATA', '2. Analytics overview specifies OPERATIONAL DATA')

    // 2. Equipment Health Analytics
    const health = await analyticsService.getEquipmentHealthAnalytics({ timeframe: '30d' })
    assert(health && typeof health.avgHealthScore === 'number', '3. Equipment health analytics returns avgHealthScore')

    // 3. Failure Risk Analytics & Disclaimers
    const risk = await analyticsService.getFailureRiskAnalytics({ timeframe: '30d' })
    assert(risk && typeof risk.avgRisk === 'number', '4. Failure risk analytics returns avgRisk')
    assert(risk.disclaimer.includes('DEMO MODEL'), '5. Failure risk contains DEMO MODEL disclaimer')

    // 4. Maintenance Analytics
    const maintenance = await analyticsService.getMaintenanceAnalytics({ timeframe: '30d' })
    assert(maintenance && typeof maintenance.completionRate === 'number', '6. Maintenance analytics returns completionRate')

    // 5. Safety Analytics
    const safety = await analyticsService.getSafetyAnalytics({ timeframe: '30d' })
    assert(safety && typeof safety.resolutionRate === 'number', '7. Safety analytics returns resolutionRate')

    // 6. Cost Analytics (no cost data default state check)
    const cost = await analyticsService.getCostAnalytics()
    assert(cost && typeof cost.totalCost === 'number', '8. Cost analytics returns numeric totalCost')

    // 7. Downtime Analytics
    const downtime = await analyticsService.getDowntimeAnalytics()
    assert(downtime && typeof downtime.totalDowntimeHours === 'number', '9. Downtime analytics returns totalDowntimeHours')

    // 8. Dataset Management & Profiling
    const datasets = await datasetService.listDatasets()
    assert(Array.isArray(datasets), '10. Dataset listing returns database records or an empty state')

    const telemetryDs = datasets.find((d) => d.datasetType === 'TELEMETRY' || d.id === 'ds-telemetry-01')
    if (telemetryDs) {
      const profile = await datasetService.profileDataset(telemetryDs.id)
      assert(profile && profile.columnCount > 0, '11. Telemetry dataset profiling succeeds')
      const validation = await datasetService.validateDataset(telemetryDs.id)
      assert(validation && validation.isValid, '12. Telemetry dataset validation succeeds')
    }

    const safetyDs = datasets.find((d) => d.datasetType === 'HISTORICAL_SAFETY' || d.id === 'ds-kaggle-safety-01')
    if (safetyDs) {
      const safetyValidation = await datasetService.validateDataset(safetyDs.id)
      assert(
        safetyValidation && safetyValidation.warnings.some((w) => w.includes('historical safety events')),
        '13. Historical safety dataset validation returns safety warning',
      )
    }

    // 9. Historical Safety Intelligence
    const historicalRecords = await historicalSafetyService.listRecords()
    assert(historicalRecords && Array.isArray(historicalRecords.records), '14. Historical safety records retrieved from database')
    assert(historicalRecords.dataLabel === 'HISTORICAL SAFETY DATA', '15. Historical safety data clearly labeled')
    assert(historicalRecords.disclaimer.includes('analytical context'), '16. Historical safety disclaimer present')

    // 10. Reports & CSV Export
    const reportData = await reportService.generateReport({ category: 'EQUIPMENT_HEALTH' })
    assert(reportData && reportData.category === 'EQUIPMENT_HEALTH', '17. Report generation succeeds')

    const csvOutput = await reportService.generateCSV({ category: 'EQUIPMENT_HEALTH' })
    assert(Boolean(csvOutput && csvOutput.includes('# MediGuard AI Operational Report')), '18. CSV export generates metadata header')

    // 11. Notifications Service
    const userNotices = await notificationService.listUserNotifications('test-user-id')
    assert(userNotices && Array.isArray(userNotices.notifications), '19. User notifications listing succeeds')

    const markResult = await notificationService.markAllAsRead('test-user-id')
    assert(markResult !== null, '20. Mark all notifications as read succeeds')

  } catch (err: any) {
    console.error('[ERROR] Phase 3G test runner encountered unexpected error:', err)
    failed++
  }

  console.log(`\n--- TEST SUMMARY: PASSED=${passed}, FAILED=${failed} ---`)
  if (failed > 0) {
    process.exit(1)
  }
}

runPhase3GTests()
