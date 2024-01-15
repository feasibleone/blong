/* eslint-disable indent,semi */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @rushstack/typedef-var */

import { validationHandlers } from '@feasibleone/blong'
import { Type, Static } from '@sinclair/typebox'

type subjectAge = Static<typeof subjectAge>
const subjectAge = Type.Function(
  [
    Type.Object({
      birthDate: Type.String({ description: 'Birth Date' })
    })
  ],
  Type.Promise(
    Type.Object({
      age: Type.Number({ description: 'Age in years' })
    })
  ),
  { description: 'Calculate age' }
)

type subjectHello = Static<typeof subjectHello>
const subjectHello = Type.Function(
  [Type.Unknown()],
  Type.Promise(
    Type.Object({
      hello: Type.Unknown()
    })
  )
)

type subjectNumberSum = Static<typeof subjectNumberSum>
const subjectNumberSum = Type.Function(
  [Type.Array(Type.Number())],
  Type.Promise(Type.Number())
)

type subjectTime = Static<typeof subjectTime>
const subjectTime = Type.Function(
  [Type.Unknown()],
  Type.Promise(
    Type.Object({
      abbreviation: Type.String()
    })
  )
)

export default validationHandlers({
  subjectAge,
  subjectHello,
  subjectNumberSum,
  subjectTime
})

declare module '@feasibleone/blong' {
  interface IRemoteHandler {
    subjectAge(
      params: Parameters<subjectAge>[0],
      $meta: IMeta
    ): ReturnType<subjectAge>
    subjectHello(
      params: Parameters<subjectHello>[0],
      $meta: IMeta
    ): ReturnType<subjectHello>
    subjectNumberSum(
      params: Parameters<subjectNumberSum>[0],
      $meta: IMeta
    ): ReturnType<subjectNumberSum>
    subjectTime(
      params: Parameters<subjectTime>[0],
      $meta: IMeta
    ): ReturnType<subjectTime>
  }
}
