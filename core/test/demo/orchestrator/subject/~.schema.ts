/* eslint-disable indent,semi */
import { validation } from '@feasibleone/blong'
import { Type, Static } from '@sinclair/typebox'

type subjectAge = Static<typeof subjectAge>
const subjectAge = Type.Object({
  params: Type.Object({
    birthDate: Type.String({ description: 'Birth Date' })
  }),
  result: Type.Object({
    age: Type.Number()
  })
})

type subjectHello = Static<typeof subjectHello>
const subjectHello = Type.Object({
  params: Type.Unknown(),
  result: Type.Object({
    hello: Type.Unknown()
  })
})

type subjectNumberSum = Static<typeof subjectNumberSum>
const subjectNumberSum = Type.Object({
  params: Type.Array(Type.Number(), { description: 'array of numbers to sum' }),
  result: Type.Number({ description: 'calculated sum' })
})

type subjectTime = Static<typeof subjectTime>
const subjectTime = Type.Object({
  params: Type.Unknown(),
  result: Type.Object({
    abbreviation: Type.Optional(Type.String())
  })
})

export default validation(() => ({
  subjectAge: () => subjectAge.properties,
  subjectHello: () => subjectHello.properties,
  subjectNumberSum: () => subjectNumberSum.properties,
  subjectTime: () => subjectTime.properties
}))
