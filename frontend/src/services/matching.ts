import type { Equipment, Technician } from '@/types'

export function recommendTechnician(equipment: Equipment, pool: Technician[]): Technician | null {
  const scored = pool
    .map((tech) => {
      let score = 0
      if (tech.expertise.includes(equipment.equipmentType)) score += 50
      if (tech.department === equipment.department) score += 20
      if (tech.location.toLowerCase().includes(equipment.department.toLowerCase())) score += 5
      if (tech.availability === 'Available') score += 20
      else if (tech.availability === 'Busy') score += 5
      score -= tech.currentWorkload * 4
      return { tech, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored[0]?.tech ?? null
}
