# MediGuard AI — Medical Equipment Intelligence & Predictive Maintenance

MediGuard AI is a clinical equipment command center providing real-time telemetry monitoring, AI failure risk assessment, automated maintenance work order management, safety alert escalation, and historical safety intelligence.

---

## Project Architecture

```
cogni_hackathon/
├── frontend/             # React 19 + TypeScript + Vite + TailwindCSS UI Application
├── backend/              # Node.js + Express + TypeScript + Socket.IO + Prisma API
├── ml-service/           # Python FastAPI + Scikit-Learn Predictive AI Engine
├── scratch/              # Temporary scratch scripts & testing utilities
└── README.md
```

---

## Quick Start Guide

### 1. Frontend Web Application (`frontend/`)
```bash
cd frontend
npm install
npm run dev
```
* Application will start at `http://localhost:5173`.

### 2. Backend API Service (`backend/`)
```bash
cd backend
npm install
npm run dev
```
* Express API and Socket.IO server will start at `http://localhost:5000`.

### 3. ML Assessment Service (`ml-service/`)
```bash
cd ml-service
pip install -r requirements.txt
python train.py
uvicorn app.main:app --port 8000 --reload
```
* FastAPI ML service will start at `http://localhost:8000`.

