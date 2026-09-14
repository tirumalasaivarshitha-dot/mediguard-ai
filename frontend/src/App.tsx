import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { RequireAuth, RequireRole, RoleDashboardRedirect } from '@/routes/guards'
import { AppLayout } from '@/components/layout/AppLayout'

import { LoginPage } from '@/pages/Login/LoginPage'
import { DashboardPage } from '@/pages/Dashboard/DashboardPage'
import { EquipmentPage } from '@/pages/Equipment/EquipmentPage'
import { EquipmentDetailPage } from '@/pages/Equipment/EquipmentDetailPage'
import { MonitoringPage } from '@/pages/Monitoring/MonitoringPage'
import { AssessmentPage } from '@/pages/Assessment/AssessmentPage'
import { MaintenancePage } from '@/pages/Maintenance/MaintenancePage'
import { SafetyPage } from '@/pages/Safety/SafetyPage'

import { DataAILayout } from '@/pages/DataAI/DataAILayout'
import { DataAIOverviewPage } from '@/pages/DataAI/OverviewPage'
import { DatasetsPage } from '@/pages/DataAI/DatasetsPage'
import { TelemetrySourcesPage } from '@/pages/DataAI/TelemetryPage'
import { TrainingPage } from '@/pages/DataAI/TrainingPage'
import { EvaluationPage } from '@/pages/DataAI/EvaluationPage'
import { SafetyIntelligencePage } from '@/pages/DataAI/SafetyIntelligencePage'

import { AnalyticsPage } from '@/pages/Analytics/AnalyticsPage'
import { ReportsPage } from '@/pages/Reports/ReportsPage'
import { NotificationsPage } from '@/pages/Notifications/NotificationsPage'
import { SettingsPage } from '@/pages/Settings/SettingsPage'
import { HistoryPage } from '@/pages/History/HistoryPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<RoleDashboardRedirect />} />
              <Route element={<RequireRole roles={['hospital_admin']} />}>
                <Route path="/dashboard/admin" element={<DashboardPage />} />
              </Route>
              <Route element={<RequireRole roles={['biomedical_engineer']} />}>
                <Route path="/dashboard/biomedical" element={<DashboardPage />} />
              </Route>
              <Route element={<RequireRole roles={['maintenance_technician']} />}>
                <Route path="/dashboard/technician" element={<DashboardPage />} />
              </Route>
              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer']} />}>
                <Route path="/equipment" element={<EquipmentPage />} />
              </Route>
              <Route element={<RequireRole roles={['maintenance_technician']} />}>
                <Route path="/equipment/assigned" element={<EquipmentPage />} />
              </Route>
              <Route path="/equipment/:id" element={<EquipmentDetailPage />} />

              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer', 'maintenance_technician']} />}>
                <Route path="/monitoring" element={<MonitoringPage />} />
              </Route>
              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer']} />}>
                <Route path="/assessment" element={<AssessmentPage />} />
              </Route>

              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer']} />}>
                <Route path="/maintenance" element={<MaintenancePage />} />
              </Route>
              <Route element={<RequireRole roles={['maintenance_technician']} />}>
                <Route path="/maintenance/my-tasks" element={<MaintenancePage />} />
              </Route>

              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer']} />}>
                <Route path="/safety" element={<SafetyPage />} />
              </Route>
              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer', 'maintenance_technician']} />}>
                <Route path="/alerts" element={<SafetyPage alertsOnly />} />
              </Route>

              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer']} />}>
              <Route path="/data-ai" element={<DataAILayout />}>
                <Route index element={<DataAIOverviewPage />} />
                <Route path="datasets" element={<DatasetsPage />} />
                <Route path="telemetry" element={<TelemetrySourcesPage />} />
                <Route path="training" element={<TrainingPage />} />
                <Route path="evaluation" element={<EvaluationPage />} />
                <Route path="safety-intelligence" element={<SafetyIntelligencePage />} />
              </Route>
              </Route>

              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer']} />}>
                <Route path="/analytics" element={<AnalyticsPage />} />
              </Route>
              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer', 'maintenance_technician']} />}>
                <Route path="/history" element={<HistoryPage />} />
              </Route>
              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer']} />}>
                <Route path="/reports" element={<ReportsPage />} />
              </Route>
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route element={<RequireRole roles={['hospital_admin', 'biomedical_engineer']} />}>
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
