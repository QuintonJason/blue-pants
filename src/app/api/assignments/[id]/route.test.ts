import { describe, it, expect, beforeEach } from 'vitest'
import { PUT } from './route'
import { resetDb, seedAssignment, jsonRequest, routeParams } from '@/test/route-helpers'

beforeEach(resetDb)

describe('PUT /api/assignments/[id] — curriculumScope', () => {
  it('saves a valid curriculum scope', async () => {
    const assignment = await seedAssignment()
    const res = await PUT(
      jsonRequest({ curriculumScope: { taughtTechniqueIds: ['css-hover'] } }),
      routeParams(assignment.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(JSON.parse(body.curriculumScope)).toEqual({ taughtTechniqueIds: ['css-hover'] })
  })

  it('saves an optional weekByTechnique citation', async () => {
    const assignment = await seedAssignment()
    const res = await PUT(
      jsonRequest({
        curriculumScope: { taughtTechniqueIds: [], weekByTechnique: { 'css-box-sizing': 5 } },
      }),
      routeParams(assignment.id)
    )
    const body = await res.json()
    expect(JSON.parse(body.curriculumScope).weekByTechnique).toEqual({ 'css-box-sizing': 5 })
  })

  it('rejects an unknown technique id', async () => {
    const assignment = await seedAssignment()
    const res = await PUT(
      jsonRequest({ curriculumScope: { taughtTechniqueIds: ['not-a-real-technique'] } }),
      routeParams(assignment.id)
    )
    expect(res.status).toBe(400)
  })

  it('clears the scope when set to null', async () => {
    const assignment = await seedAssignment({ curriculumScope: JSON.stringify({ taughtTechniqueIds: ['css-hover'] }) })
    const res = await PUT(jsonRequest({ curriculumScope: null }), routeParams(assignment.id))
    const body = await res.json()
    expect(body.curriculumScope).toBeNull()
  })

  it('leaves curriculumScope untouched when not included in the request', async () => {
    const assignment = await seedAssignment({ curriculumScope: JSON.stringify({ taughtTechniqueIds: ['css-hover'] }) })
    const res = await PUT(jsonRequest({ name: 'Renamed' }), routeParams(assignment.id))
    const body = await res.json()
    expect(JSON.parse(body.curriculumScope)).toEqual({ taughtTechniqueIds: ['css-hover'] })
  })
})
