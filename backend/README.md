# MediGuard AI — Backend API Service Foundation

Clean Node.js + Express + TypeScript + Socket.IO API foundation for MediGuard AI.

## Getting Started

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Development Mode
```bash
npm run dev
```

The server will start on `http://localhost:5000`.

### 3. Production Build
```bash
npm run build
npm start
```

## API Endpoints

- `GET /health` — Health check endpoint

### Available Route Placeholders (`/api`)
- `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`
- `GET /api/equipment`, `GET /api/equipment/:id`
- `GET /api/telemetry/:id`
- `POST /api/assessment/analyze`
- `GET /api/maintenance`, `POST /api/maintenance`
- `GET /api/safety/alerts`
- `GET /api/technicians`
- `GET /api/notifications`
- `GET /api/datasets`
- `GET /api/models`
- `GET /api/analytics`
- `GET /api/reports`
- `POST /api/simulation/what-if`

## Socket.IO Events
Real-time infrastructure configured for broadcasting:
- `equipment:update`
- `telemetry:update`
- `prediction:update`
- `risk:changed`
- `alert:created`
- `notification:created`
- `maintenance:updated`
- `equipment:status_changed`
